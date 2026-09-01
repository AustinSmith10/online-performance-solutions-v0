import "server-only";
import { extractPdfTextAndPageCount, runTextCompletion, type JsonOutputSchema } from "@/lib/documents/extractor";
import { DEFAULT_JUDGE_DOCUMENT_TEXT_CHAR_CAP } from "@/lib/settings/judge-document-text-cap";

const JUDGE_SCHEMA: JsonOutputSchema = {
  name: "judge_result",
  schema: {
    type: "object",
    properties: {
      matches: { type: "boolean" },
      // #174: an explicit self-reported confidence. A confident "matches" is a
      // clean pass; a low-confidence one is treated the same as a judge error
      // — a soft "couldn't confirm" gate, never a hard block.
      confidence: { type: "string", enum: ["high", "low"] },
      reason: { type: "string" },
    },
    required: ["matches", "confidence", "reason"],
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
 *
 * `docTextCap` is admin-configurable (lib/settings/judge-document-text-cap.ts)
 * rather than a fixed constant — it directly trades off judge-call cost
 * against how much of a long document the judge actually sees.
 */
function buildJudgePrompt(hint: string, docText: string, sampleText: string | null | undefined, docTextCap: number): string {
  const sampleSection = sampleText
    ? `\n\nHere is the text of a reference sample document that is a known-good example of what's expected:\n${sampleText.slice(0, docTextCap)}\n`
    : "";

  return `You are checking whether an uploaded document matches what was expected for a specific upload slot, for an Australian building compliance system.

Expected document description: ${hint}
${sampleSection}
Document text:
${docText.slice(0, docTextCap)}

Does this document match the expected description? Return ONLY a JSON object: { "matches": true|false, "confidence": "high"|"low", "reason": "one short sentence explaining your answer; empty string only if matches is true and confidence is high" }

Use "low" confidence if the document text is too short, garbled, or ambiguous to tell.`;
}

/**
 * AI-judge layer (#113): reuses the extraction pipeline's hint-grounded
 * judge pattern (runTextCompletion) rather than a bespoke AI call.
 *
 * #174: still never hard-blocks an upload, but a judge error / unparseable
 * response / self-reported low confidence is no longer silently swallowed as
 * a clean pass. It comes back as `{ ok: true, unverified: true }` so the
 * caller can surface the same soft "couldn't confirm this is a {X}" friction
 * the explicit-mismatch path already shows. `sampleText` (#115) is optional
 * extra grounding extracted from an admin-uploaded reference sample; absent,
 * the judge behaves exactly as it did in #113. `docTextCap` defaults to the
 * settings-module default so existing call sites (and tests) don't need to
 * pass it explicitly — production callers should fetch the admin-configured
 * value via getJudgeDocumentTextCharCap and pass it through.
 */
export interface AiJudgeResult {
  ok: boolean;
  reason?: string;
  /** Judge couldn't give a confident verdict (error, bad JSON, or low
   *  self-reported confidence). Non-blocking — a soft "please check" gate. */
  unverified?: boolean;
}

export async function runAiJudgeCheck(
  requirement: { aiJudgeHint: string | null; name?: string },
  docText: string,
  sampleText?: string | null,
  docTextCap: number = DEFAULT_JUDGE_DOCUMENT_TEXT_CHAR_CAP
): Promise<AiJudgeResult | null> {
  if (!requirement.aiJudgeHint) return null;

  const what = requirement.name ? `this is ${requirement.name}` : "this is the expected document";
  const unverified = (): AiJudgeResult => ({
    ok: true,
    unverified: true,
    reason: `Couldn't automatically confirm ${what} — please check it's the right document.`,
  });

  try {
    const raw = await runTextCompletion(
      buildJudgePrompt(requirement.aiJudgeHint, docText, sampleText, docTextCap),
      "file requirement AI judge",
      JUDGE_SCHEMA
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return unverified();
    const parsed = JSON.parse(match[0]) as { matches?: unknown; confidence?: unknown; reason?: unknown };
    if (parsed.matches === false) {
      return {
        ok: false,
        reason:
          typeof parsed.reason === "string" && parsed.reason
            ? parsed.reason
            : "Document may not match the expected type.",
      };
    }
    if (parsed.confidence === "low") return unverified();
    return { ok: true };
  } catch (err) {
    console.error("[file-requirement-verification] AI judge check errored — surfacing as unverified:", err);
    return unverified();
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
 * `docTextCap` defaults to the settings-module default; production callers
 * should fetch the admin-configured value and pass it through.
 */
export async function verifyUploadAgainstRequirement(
  requirement: FileRequirementLike,
  buffer: Buffer,
  isPdf: boolean,
  sampleText?: string | null,
  docTextCap: number = DEFAULT_JUDGE_DOCUMENT_TEXT_CHAR_CAP
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

  const judged = await runAiJudgeCheck(requirement, doc.text, sampleText, docTextCap);
  if (judged && !judged.ok) {
    reasons.push(judged.reason ?? `May not be ${requirement.name}.`);
  } else if (judged?.unverified) {
    // #174: judge couldn't confirm — same soft "needs review" friction as an
    // explicit mismatch, never a hard block.
    reasons.push(judged.reason ?? `Couldn't confirm this is ${requirement.name} — please check it.`);
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
