import { describe, expect, it } from "vitest";
import { buildResetWarningCopy } from "./reset-warning";

describe("buildResetWarningCopy", () => {
  it("names approved and rejected reviewers with counts", () => {
    const copy = buildResetWarningCopy([
      { name: "Sarah", status: "approved_without_comments" },
      { name: "Tom", status: "approved_with_comments" },
      { name: "Rattan", status: "rejected_with_comments" },
    ]);
    expect(copy).toBe(
      "This resets approvals from Sarah, Tom (2 already approved) and Rattan (1 rejected) — everyone will need to review again once you redispatch."
    );
  });

  it("omits the approved clause when nobody approved", () => {
    const copy = buildResetWarningCopy([{ name: "Rattan", status: "rejected_with_comments" }]);
    expect(copy).toBe(
      "This resets approvals from Rattan (1 rejected) — everyone will need to review again once you redispatch."
    );
  });

  it("falls back to generic copy when nobody has approved or rejected yet", () => {
    const copy = buildResetWarningCopy([{ name: "Sarah", status: "pending" }]);
    expect(copy).toBe(
      "This resets approvals for this cycle — everyone will need to review again once you redispatch."
    );
  });

  it("ignores waived reviewers for the approved/rejected clauses", () => {
    const copy = buildResetWarningCopy([{ name: "Sarah", status: "waived" }]);
    expect(copy).toBe(
      "This resets approvals for this cycle — everyone will need to review again once you redispatch."
    );
  });
});
