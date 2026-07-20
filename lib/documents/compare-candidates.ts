import "server-only";
import type { ExtractedCandidate } from "./extractor";
import { runTextCompletion } from "./extractor";

export type ComparisonMode = "exact" | "normalized" | "semantic";

export interface CandidateGroup {
  value: string;
  members: ExtractedCandidate[];
}

function normalizeText(v: string): string {
  return v.trim().replace(/\s+/g, " ").toLowerCase();
}

// Street number, unit number, postcode — the numeric parts of an address
// that must never be fuzzed by semantic comparison, per the #58 decision.
function numericSignature(v: string): string {
  return (v.match(/\d+/g) ?? []).join(",");
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

function parseGroupIndices(raw: string, count: number): number[][] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<number>();
    const groups: number[][] = [];
    for (const g of parsed) {
      if (!Array.isArray(g)) continue;
      const idxs = g.filter(
        (i): i is number => typeof i === "number" && i >= 0 && i < count && !seen.has(i)
      );
      idxs.forEach((i) => seen.add(i));
      if (idxs.length) groups.push(idxs);
    }
    return groups;
  } catch {
    return [];
  }
}

// Distinct-normalized-text groups that share a numeric signature (so they're
// only "maybe the same" candidates, never ones that already differ in a
// number) get asked of the AI as a batch: which of these denote the same
// real-world value? On any failure to parse a confident answer, candidates
// stay split — merging is opt-in, not the safe default.
async function resolveSemanticEquivalence(groups: CandidateGroup[]): Promise<CandidateGroup[]> {
  if (groups.length <= 1) return groups;

  const prompt = `You are comparing extracted field values for equivalence. Below is a numbered list of distinct text values extracted from documents about the same real-world thing:

${groups.map((g, i) => `${i}: "${g.value}"`).join("\n")}

Group the indices that refer to the SAME real-world value (e.g. differing only in abbreviation, word order, or casing — such as "St" vs "Street"). Do NOT merge values whose meaning differs. Return ONLY a JSON array of arrays of indices, one array per distinct real-world value, e.g. [[0,2],[1]]. Every index 0..${groups.length - 1} must appear exactly once.`;

  let raw: string;
  try {
    raw = await runTextCompletion(prompt);
  } catch (err) {
    console.error("[compare-candidates] semantic equivalence call failed:", err);
    return groups;
  }

  const indexGroups = parseGroupIndices(raw, groups.length);
  const coveredIndices = new Set(indexGroups.flat());
  if (indexGroups.length === 0 || coveredIndices.size !== groups.length) {
    return groups;
  }

  return indexGroups.map((idxs) => {
    const members = idxs.flatMap((i) => groups[i].members);
    const representative =
      members.find((m) => idxs[0] !== undefined && groups[idxs[0]].value === m.value)?.value ??
      groups[idxs[0]].value;
    return { value: representative, members };
  });
}

export async function groupCandidates(
  candidates: ExtractedCandidate[],
  mode: ComparisonMode
): Promise<CandidateGroup[]> {
  if (candidates.length === 0) return [];
  if (mode === "exact") return groupByKey(candidates, (v) => v.trim());
  if (mode === "normalized") return groupByKey(candidates, normalizeText);

  // semantic — never fuzz numbers; only ask AI to reconcile text within the
  // same numeric signature.
  const byNormalized = groupByKey(candidates, normalizeText);
  if (byNormalized.length <= 1) return byNormalized;

  const byNumericSignature = new Map<string, CandidateGroup[]>();
  for (const g of byNormalized) {
    const sig = numericSignature(g.value);
    const list = byNumericSignature.get(sig) ?? [];
    list.push(g);
    byNumericSignature.set(sig, list);
  }

  const finalGroups: CandidateGroup[] = [];
  for (const groups of byNumericSignature.values()) {
    if (groups.length === 1) {
      finalGroups.push(groups[0]);
    } else {
      finalGroups.push(...(await resolveSemanticEquivalence(groups)));
    }
  }
  return finalGroups;
}
