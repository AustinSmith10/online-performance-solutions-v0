import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./extractor", async () => {
  const actual = await vi.importActual<typeof import("./extractor")>("./extractor");
  return { ...actual, runTextCompletion: vi.fn() };
});

import { groupCandidates } from "./compare-candidates";
import { runTextCompletion } from "./extractor";
import type { ExtractedCandidate } from "./extractor";

// Call-count assertions (toHaveBeenCalledTimes, not.toHaveBeenCalled) would
// otherwise accumulate across tests in this file, since vi.fn() calls
// persist until cleared.
beforeEach(() => {
  vi.mocked(runTextCompletion).mockClear();
});

function candidate(value: string, source_document = "doc"): ExtractedCandidate {
  return { value, confidence: "high", source_document };
}

describe("groupCandidates — exact mode", () => {
  it("keeps identical values in one group", async () => {
    const groups = await groupCandidates([candidate("123 Main St"), candidate("123 Main St")], "exact");
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(2);
  });

  it("treats whitespace/case differences as distinct", async () => {
    const groups = await groupCandidates([candidate("123 Main St"), candidate("123 main st")], "exact");
    expect(groups).toHaveLength(2);
  });
});

describe("groupCandidates — normalized mode", () => {
  it("collapses whitespace and case differences", async () => {
    const groups = await groupCandidates([candidate("123  Main   St"), candidate("123 main st")], "normalized");
    expect(groups).toHaveLength(1);
  });

  it("still keeps genuinely different text distinct", async () => {
    const groups = await groupCandidates([candidate("123 Main St"), candidate("456 Other Ave")], "normalized");
    expect(groups).toHaveLength(2);
  });
});

describe("groupCandidates — semantic mode", () => {
  it("never merges values whose numeric signature differs, without calling AI", async () => {
    const groups = await groupCandidates([candidate("12 Smith St"), candidate("14 Smith St")], "semantic");
    expect(groups).toHaveLength(2);
    expect(runTextCompletion).not.toHaveBeenCalled();
  });

  it("merges text that AI confirms is equivalent within the same numeric signature", async () => {
    vi.mocked(runTextCompletion).mockResolvedValue('{"groups": [[0,1]]}');
    const groups = await groupCandidates([candidate("12 Smith St"), candidate("12 Smith Street")], "semantic");
    expect(groups).toHaveLength(1);
    expect(runTextCompletion).toHaveBeenCalled();
  });

  it("keeps candidates split if the AI response can't be parsed with confidence", async () => {
    vi.mocked(runTextCompletion).mockResolvedValue("not json");
    const groups = await groupCandidates([candidate("12 Smith St"), candidate("12 Smith Street")], "semantic");
    expect(groups).toHaveLength(2);
  });

  it("keeps candidates split if the AI call throws", async () => {
    vi.mocked(runTextCompletion).mockRejectedValue(new Error("provider down"));
    const groups = await groupCandidates([candidate("12 Smith St"), candidate("12 Smith Street")], "semantic");
    expect(groups).toHaveLength(2);
  });

  // Regression test for the false-merge bug: two genuinely different
  // addresses that happen to share a house number (same numeric signature,
  // zero overlapping words) must never even be sent to the AI — matching
  // digits alone isn't grounds to ask whether they're the same value.
  it("never asks the AI about values sharing only a number, with no overlapping words", async () => {
    const groups = await groupCandidates([candidate("12 Smith St"), candidate("12 Jones St")], "semantic");
    expect(groups).toHaveLength(2);
    expect(runTextCompletion).not.toHaveBeenCalled();
  });

  it("partitions a numeric-signature bucket into separate word-overlap clusters, each independently resolved", async () => {
    // "12 Smith St" / "12 Smith Street" share "smith" (goes to AI, merges).
    // "12 Jones St" shares nothing with either (bypasses AI, stays split).
    vi.mocked(runTextCompletion).mockResolvedValue('{"groups": [[0,1]]}');
    const groups = await groupCandidates(
      [candidate("12 Smith St"), candidate("12 Smith Street"), candidate("12 Jones St")],
      "semantic"
    );
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.members.length).sort()).toEqual([1, 2]);
    expect(runTextCompletion).toHaveBeenCalledTimes(1);
  });
});
