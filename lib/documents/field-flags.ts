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
    return { finalValue: "", needsFlag: false, flagType: "confidence", candidateRecords: [] };
  }

  const groups = await groupCandidates(candidates, comparisonMode);
  const distinct = groups.length > 1;

  const best = candidates.reduce((a, b) => (confidenceRank(b.confidence) > confidenceRank(a.confidence) ? b : a));
  const bestIsLowConfidence = best.confidence !== "high";

  const needsFlag = distinct || bestIsLowConfidence;
  const flagType: FlagType = distinct && bestIsLowConfidence ? "both" : distinct ? "inconsistency" : "confidence";

  return { finalValue: best.value, needsFlag, flagType, candidateRecords: candidates };
}
