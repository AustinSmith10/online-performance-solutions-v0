import { describe, expect, it } from "vitest";
import { formatRoundTally, summarizeRound } from "./round-summary";

describe("summarizeRound", () => {
  it("counts approvals, rejections and pending, ignoring waived/superseded in the buckets", () => {
    const s = summarizeRound([
      { status: "approved_with_comments" },
      { status: "rejected_without_comments" },
      { status: "pending" },
      { status: "waived" },
      { status: "superseded" },
    ]);
    expect(s).toEqual({ total: 5, approved: 1, rejected: 1, pending: 1 });
  });
});

describe("formatRoundTally", () => {
  it("is null for an empty round", () => {
    expect(formatRoundTally(summarizeRound([]))).toBeNull();
  });
  it("lists only the non-zero parts", () => {
    expect(formatRoundTally({ total: 2, approved: 0, rejected: 1, pending: 1 })).toBe("1 rejected · 1 pending");
    expect(formatRoundTally({ total: 3, approved: 2, rejected: 0, pending: 1 })).toBe("2 approved · 1 pending");
  });
  it("is null when everything is waived or superseded", () => {
    expect(formatRoundTally({ total: 2, approved: 0, rejected: 0, pending: 0 })).toBeNull();
  });
});
