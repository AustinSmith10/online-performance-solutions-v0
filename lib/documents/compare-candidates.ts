import "server-only";
import type { ExtractedCandidate, JsonOutputSchema } from "./extractor";
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

// Common address-type words that carry no disambiguating meaning on their
// own (two different streets can both be a "St") — stripped before checking
// word overlap. General text-similarity vocabulary, not a per-field-name
// rule: it applies to whatever token is running in semantic mode, address or
// otherwise, same as numericSignature above.
const OVERLAP_STOPWORDS = new Set([
  "st", "street", "rd", "road", "ave", "avenue", "ln", "lane", "dr", "drive",
  "unit", "lot", "blvd", "boulevard", "ct", "court", "pl", "place", "the", "of", "and",
]);

function coreWords(v: string): Set<string> {
  const words = v
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w) && !OVERLAP_STOPWORDS.has(w));
  return new Set(words);
}

function shareCoreWord(a: CandidateGroup, b: CandidateGroup): boolean {
  const wordsA = coreWords(a.value);
  for (const w of coreWords(b.value)) {
    if (wordsA.has(w)) return true;
  }
  return false;
}

// Within a numeric-signature bucket, further partitions groups so only ones
// that also share a non-numeric, non-stopword word ever reach the AI. Two
// values that merely share a house number or postcode digit sequence — e.g.
// "12 Smith St" vs "12 Jones St" — have nothing in common once the numbers
// are set aside, and shouldn't even be *asked about*: matching digits alone
// was never meant to be grounds for a possible merge, only the trigger for
// checking whether the wording differs on an otherwise-identical value.
// Simple union-find: any pair sharing a core word joins the same cluster.
function clusterByWordOverlap(groups: CandidateGroup[]): CandidateGroup[][] {
  const parent = groups.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(a: number, b: number): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      if (shareCoreWord(groups[i], groups[j])) union(i, j);
    }
  }
  const clusters = new Map<number, CandidateGroup[]>();
  groups.forEach((g, i) => {
    const root = find(i);
    const list = clusters.get(root) ?? [];
    list.push(g);
    clusters.set(root, list);
  });
  return [...clusters.values()];
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

// Both providers' structured-output modes require an object at the top
// level (not a bare array), hence the "groups" wrapper — parseGroupIndices
// reads that field.
const SEMANTIC_GROUPS_SCHEMA: JsonOutputSchema = {
  name: "semantic_groups",
  schema: {
    type: "object",
    properties: {
      groups: { type: "array", items: { type: "array", items: { type: "integer" } } },
    },
    required: ["groups"],
    additionalProperties: false,
  },
};

function parseGroupIndices(raw: string, count: number): number[][] {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as { groups?: unknown };
    const groupsRaw = parsed.groups;
    if (!Array.isArray(groupsRaw)) return [];
    const seen = new Set<number>();
    const groups: number[][] = [];
    for (const g of groupsRaw) {
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

// Candidates reaching here already share a numeric signature AND at least
// one non-stopword word (clusterByWordOverlap) — so they're genuinely "maybe
// the same, differently worded" candidates, not just two values that happen
// to share a digit. On any failure to parse a confident answer, candidates
// stay split — merging is opt-in, not the safe default.
async function resolveSemanticEquivalence(groups: CandidateGroup[]): Promise<CandidateGroup[]> {
  if (groups.length <= 1) return groups;

  const prompt = `You are comparing extracted field values for equivalence. Below is a numbered list of distinct text values extracted from documents about the same real-world thing:

${groups.map((g, i) => `${i}: "${g.value}"`).join("\n")}

Group the indices that refer to the SAME real-world value (e.g. differing only in abbreviation, word order, or casing — such as "St" vs "Street"). Two values can share a number and still be different real-world values — e.g. the same house number on a different street, or the same postcode with a different street, suburb, or unit. Only merge when the difference is purely in how the same value is written (abbreviation, word order, casing, or formatting); never merge based on a shared number alone, and do NOT merge values whose meaning differs. Return ONLY a JSON object of this shape: { "groups": [[0,2],[1]] } — an array of arrays of indices, one inner array per distinct real-world value. Every index 0..${groups.length - 1} must appear exactly once.`;

  let raw: string;
  try {
    raw = await runTextCompletion(prompt, "semantic candidate comparison", SEMANTIC_GROUPS_SCHEMA);
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
      continue;
    }
    for (const cluster of clusterByWordOverlap(groups)) {
      if (cluster.length === 1) {
        finalGroups.push(cluster[0]);
      } else {
        finalGroups.push(...(await resolveSemanticEquivalence(cluster)));
      }
    }
  }
  return finalGroups;
}
