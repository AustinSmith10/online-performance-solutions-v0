import "server-only";
import { extractPdfTextAndPageCount, runTextCompletion } from "@/lib/documents/extractor";

export interface FileRequirementMarkers {
  markerTextPatterns: string[] | null;
  markerPageCountMin: number | null;
  markerPageCountMax: number | null;
  markerRegex: string | null;
  aiJudgeHint: string | null;
}

export interface FileRequirementLike extends FileRequirementMarkers {
  name: string;
}

/**
 * Deterministic layer (#113): admin-defined text markers, page-count range,
 * and/or a regex pattern. Every sub-check configured on the row must pass —
 * an unconfigured row (nothing set) has nothing to check and is skipped
 * entirely (returns null, not a pass), consistent with this layer being
 * optional per row.
 */
export function runDeterministicCheck(
  requirement: FileRequirementMarkers,
  doc: { text: string; pageCount: number }
): { ok: boolean; reason?: string } | null {
  const hasTextMarkers = (requirement.markerTextPatterns?.length ?? 0) > 0;
  const hasPageRange = requirement.markerPageCountMin != null || requirement.markerPageCountMax != null;
  const hasRegex = !!requirement.markerRegex;

  if (!hasTextMarkers && !hasPageRange && !hasRegex) return null;

  if (hasTextMarkers) {
    const missing = requirement.markerTextPatterns!.filter(
      (marker) => !doc.text.toLowerCase().includes(marker.toLowerCase())
    );
    if (missing.length > 0) {
      return { ok: false, reason: `Expected text not found: "${missing[0]}"` };
    }
  }

  if (hasPageRange) {
    const { markerPageCountMin: min, markerPageCountMax: max } = requirement;
    if ((min != null && doc.pageCount < min) || (max != null && doc.pageCount > max)) {
      return {
        ok: false,
        reason: `Expected ${min ?? 0}–${max ?? "∞"} pages, got ${doc.pageCount}.`,
      };
    }
  }

  if (hasRegex) {
    try {
      if (!new RegExp(requirement.markerRegex!).test(doc.text)) {
        return { ok: false, reason: "Document did not match the expected pattern." };
      }
    } catch (err) {
      console.warn("[file-requirement-verification] invalid regex, skipping:", err);
    }
  }

  return { ok: true };
}

function buildJudgePrompt(hint: string, docText: string): string {
  return `You are checking whether an uploaded document matches what was expected for a specific upload slot, for an Australian building compliance system.

Expected document description: ${hint}

Document text:
${docText.slice(0, 8000)}

Does this document match the expected description? Return ONLY a JSON object: { "matches": true|false, "reason": "one short sentence if false, empty string if true" }`;
}

/**
 * AI-judge layer (#113): reuses the extraction pipeline's hint-grounded
 * judge pattern (runTextCompletion) rather than a bespoke AI call. Fails
 * open on any error or unparseable response — a broken checker must never
 * block an otherwise-valid upload.
 */
export async function runAiJudgeCheck(
  requirement: { aiJudgeHint: string | null },
  docText: string
): Promise<{ ok: boolean; reason?: string } | null> {
  if (!requirement.aiJudgeHint) return null;

  try {
    const raw = await runTextCompletion(buildJudgePrompt(requirement.aiJudgeHint, docText));
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { ok: true };
    const parsed = JSON.parse(match[0]) as { matches?: unknown; reason?: unknown };
    if (parsed.matches === false) {
      return { ok: false, reason: typeof parsed.reason === "string" && parsed.reason ? parsed.reason : "Document may not match the expected type." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[file-requirement-verification] AI judge check failed, failing open:", err);
    return { ok: true };
  }
}

/**
 * Orchestrates both layers for one uploaded file against its slot's
 * file_requirements row. PDF-only — non-PDF uploads (images) have no text
 * to check against and are skipped (fail-open by omission), matching this
 * layer's "never hard block" posture.
 */
export async function verifyUploadAgainstRequirement(
  requirement: FileRequirementLike,
  buffer: Buffer,
  isPdf: boolean
): Promise<string[]> {
  if (!isPdf) return [];

  let doc: { text: string; pageCount: number };
  try {
    doc = await extractPdfTextAndPageCount(buffer);
  } catch (err) {
    console.warn("[file-requirement-verification] failed to parse PDF, skipping:", err);
    return [];
  }

  const reasons: string[] = [];

  const deterministic = runDeterministicCheck(requirement, doc);
  if (deterministic && !deterministic.ok) {
    reasons.push(deterministic.reason ?? `Doesn't look like ${requirement.name}.`);
  }

  const judged = await runAiJudgeCheck(requirement, doc.text);
  if (judged && !judged.ok) {
    reasons.push(judged.reason ?? `May not be ${requirement.name}.`);
  }

  return reasons;
}
