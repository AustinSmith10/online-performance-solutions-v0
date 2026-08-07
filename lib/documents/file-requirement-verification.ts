import "server-only";
import { extractPdfTextAndPageCount, runTextCompletion, type JsonOutputSchema } from "@/lib/documents/extractor";

const JUDGE_SCHEMA: JsonOutputSchema = {
  name: "judge_result",
  schema: {
    type: "object",
    properties: { matches: { type: "boolean" }, reason: { type: "string" } },
    required: ["matches", "reason"],
    additionalProperties: false,
  },
};

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

/**
 * When a reference sample is present (#115), it's additive grounding
 * alongside the existing hint text, not a replacement for it — the prompt
 * must otherwise match #113's original shape byte-for-byte so an
 * unconfigured sample leaves the no-sample behavior unchanged.
 */
function buildJudgePrompt(hint: string, docText: string, sampleText?: string | null): string {
  const sampleSection = sampleText
    ? `\n\nHere is the text of a reference sample document that is a known-good example of what's expected:\n${sampleText.slice(0, 8000)}\n`
    : "";

  return `You are checking whether an uploaded document matches what was expected for a specific upload slot, for an Australian building compliance system.

Expected document description: ${hint}
${sampleSection}
Document text:
${docText.slice(0, 8000)}

Does this document match the expected description? Return ONLY a JSON object: { "matches": true|false, "reason": "one short sentence if false, empty string if true" }`;
}

/**
 * AI-judge layer (#113): reuses the extraction pipeline's hint-grounded
 * judge pattern (runTextCompletion) rather than a bespoke AI call. Fails
 * open on any error or unparseable response — a broken checker must never
 * block an otherwise-valid upload. `sampleText` (#115) is optional extra
 * grounding extracted from an admin-uploaded reference sample; absent, the
 * judge behaves exactly as it did in #113.
 */
export async function runAiJudgeCheck(
  requirement: { aiJudgeHint: string | null },
  docText: string,
  sampleText?: string | null
): Promise<{ ok: boolean; reason?: string } | null> {
  if (!requirement.aiJudgeHint) return null;

  try {
    const raw = await runTextCompletion(
      buildJudgePrompt(requirement.aiJudgeHint, docText, sampleText),
      "file requirement AI judge",
      JUDGE_SCHEMA
    );
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
 * layer's "never hard block" posture. `sampleText` (#115) is the already-
 * extracted text of the requirement's reference sample, if one is
 * configured — extracting it is the caller's job (it's shared across every
 * upload into a multi-file slot, so it shouldn't be re-extracted per file).
 */
export async function verifyUploadAgainstRequirement(
  requirement: FileRequirementLike,
  buffer: Buffer,
  isPdf: boolean,
  sampleText?: string | null
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

  const judged = await runAiJudgeCheck(requirement, doc.text, sampleText);
  if (judged && !judged.ok) {
    reasons.push(judged.reason ?? `May not be ${requirement.name}.`);
  }

  return reasons;
}

/**
 * Downloads and extracts a requirement's reference sample text for use as
 * AI-judge grounding (#115). PDF-only, matching the judge's own scope; fails
 * open (returns null) on any error so a bad sample never blocks verification
 * for the file actually being checked.
 */
export async function extractReferenceSampleText(
  downloadSample: () => Promise<Buffer>
): Promise<string | null> {
  try {
    const buffer = await downloadSample();
    const { text } = await extractPdfTextAndPageCount(buffer);
    return text;
  } catch (err) {
    console.warn("[file-requirement-verification] failed to read reference sample, skipping:", err);
    return null;
  }
}
