import "server-only";
import type { ExtractedCandidate } from "./extractor";

export type ComparisonMode = "exact" | "normalized" | "semantic";

export interface CandidateGroup {
  value: string;
  members: ExtractedCandidate[];
}

function normalizeText(v: string): string {
  return v.trim().replace(/\s+/g, " ").toLowerCase();
}

// Common street-type abbreviations, expanded to a canonical form before
// comparison — the one class of "differently worded, same real-world value"
// case that's safe to resolve deterministically (an enumerable dictionary of
// English address abbreviations, not a guess). Numbers are never touched
// here (per the #58 decision) — canonicalize() only rewrites these specific
// words, so "12 Smith St" can equal "12 Smith Street" but never "14 Smith
// St" or "12 Jones St": the number and every other word still has to match
// exactly. Anything canonicalization doesn't resolve stays split — and
// therefore flagged as a discrepancy — rather than guessed at by an AI call.
const STREET_TYPE_EXPANSIONS: Record<string, string> = {
  st: "street",
  rd: "road",
  ave: "avenue",
  ln: "lane",
  dr: "drive",
  blvd: "boulevard",
  ct: "court",
  pl: "place",
};

function canonicalize(v: string): string {
  return v
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => STREET_TYPE_EXPANSIONS[w] ?? w)
    .join(" ");
}

function groupByKey(
  candidates: ExtractedCandidate[],
  keyFn: (v: string) => string
): CandidateGroup[] {
  const groups = new Map<string, CandidateGroup>();
  for (const c of candidates) {
    const key = keyFn(c.value);
    const existing = groups.get(key);
    if (existing) {
      existing.members.push(c);
    } else {
      groups.set(key, { value: c.value, members: [c] });
    }
  }
  return [...groups.values()];
}

export function groupCandidates(
  candidates: ExtractedCandidate[],
  mode: ComparisonMode
): CandidateGroup[] {
  if (candidates.length === 0) return [];
  if (mode === "exact") return groupByKey(candidates, (v) => v.trim());
  if (mode === "normalized") return groupByKey(candidates, normalizeText);
  return groupByKey(candidates, canonicalize);
}
