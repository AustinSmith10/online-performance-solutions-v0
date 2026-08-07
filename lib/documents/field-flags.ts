import "server-only";
import type { Confidence, ExtractedCandidate } from "./extractor";
import { groupCandidates, type ComparisonMode } from "./compare-candidates";

// `type` is descriptive metadata only (why the flag was raised) — never a
// second independently-resolvable record. See the #58 candidate-list model.
export type FlagType = "confidence" | "inconsistency" | "both";

export interface FieldFlagPlan {
  finalValue: string;
  needsFlag: boolean;
  flagType: FlagType;
  // Every document's own candidate, never deduped away — a reviewer must be
  // able to see each candidate's own confidence and source document.
  candidateRecords: ExtractedCandidate[];
}

function confidenceRank(c: Confidence): number {
  return c === "high" ? 2 : c === "medium" ? 1 : 0;
}

export async function buildFieldFlagPlan(
  candidates: ExtractedCandidate[],
  comparisonMode: ComparisonMode
): Promise<FieldFlagPlan> {
  if (candidates.length === 0) {
    // A field extraction that whiffed on every document must flag for human
    // review, not vanish (extraction-verification-layer-decisions #7) — this
    // previously returned needsFlag:false, silently leaving the field blank
    // with no signal anyone should look. The synthetic placeholder candidate
    // gives the reviewer something to see/resolve against, same shape as any
    // other candidate.
    const placeholder: ExtractedCandidate = {
      value: "",
      confidence: "low",
      source_document: "none",
      reason: "Not found in any submitted document — please fill in.",
    };
    return { finalValue: "", needsFlag: true, flagType: "confidence", candidateRecords: [placeholder] };
  }

  const groups = await groupCandidates(candidates, comparisonMode);
  const distinct = groups.length > 1;

  // Self-graded confidence is the model checking its own work — it's not an
  // independent signal, so it no longer drives flagging. The only thing
  // worth interrupting a reviewer for is a genuine discrepancy: candidates
  // that disagree, whether from different documents or multiple distinct
  // values bundled in one document (buildPrompt already splits those into
  // separate array elements, so groupCandidates sees them the same way).
  const best = candidates.reduce((a, b) => (confidenceRank(b.confidence) > confidenceRank(a.confidence) ? b : a));

  const needsFlag = distinct;
  const flagType: FlagType = "inconsistency";

  return { finalValue: best.value, needsFlag, flagType, candidateRecords: candidates };
}
