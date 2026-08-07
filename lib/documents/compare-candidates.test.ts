import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { groupCandidates } from "./compare-candidates";
import type { ExtractedCandidate } from "./extractor";

function candidate(value: string, source_document = "doc"): ExtractedCandidate {
  return { value, confidence: "high", source_document };
}

describe("groupCandidates — exact mode", () => {
  it("keeps identical values in one group", () => {
    const groups = groupCandidates([candidate("123 Main St"), candidate("123 Main St")], "exact");
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it("treats whitespace/case differences as distinct", () => {
    const groups = groupCandidates([candidate("123 Main St"), candidate("123 main st")], "exact");
    expect(groups).toHaveLength(2);
  });
});

describe("groupCandidates — normalized mode", () => {
  it("collapses whitespace and case differences", () => {
    const groups = groupCandidates([candidate("123  Main   St"), candidate("123 main st")], "normalized");
    expect(groups).toHaveLength(1);
  });

  it("still keeps genuinely different text distinct", () => {
    const groups = groupCandidates([candidate("123 Main St"), candidate("456 Other Ave")], "normalized");
    expect(groups).toHaveLength(2);
  });
});

describe("groupCandidates — semantic mode (deterministic, no AI)", () => {
  it("never merges values whose number differs", () => {
    const groups = groupCandidates([candidate("12 Smith St"), candidate("14 Smith St")], "semantic");
    expect(groups).toHaveLength(2);
  });

  it("merges a street-type abbreviation with its expanded form", () => {
    const groups = groupCandidates([candidate("12 Smith St"), candidate("12 Smith Street")], "semantic");
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it("never merges values sharing only a number, with different words", () => {
    const groups = groupCandidates([candidate("12 Smith St"), candidate("12 Jones St")], "semantic");
    expect(groups).toHaveLength(2);
  });

  it("collapses whitespace, case, and punctuation differences same as normalized mode", () => {
    const groups = groupCandidates([candidate("12  Smith St."), candidate("12 smith st")], "semantic");
    expect(groups).toHaveLength(1);
  });

  it("partitions a bucket into the right groups when only some entries share an abbreviation", () => {
    const groups = groupCandidates(
      [candidate("12 Smith St"), candidate("12 Smith Street"), candidate("12 Jones St")],
      "semantic"
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.members.length).sort()).toEqual([1, 2]);
  });
});
