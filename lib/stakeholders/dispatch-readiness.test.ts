import { describe, it, expect } from "vitest";
import { classifyPbdbDispatchReadiness } from "./dispatch-readiness";

describe("classifyPbdbDispatchReadiness", () => {
  it("in_progress + qa_completed_by → initial", () => {
    expect(
      classifyPbdbDispatchReadiness({ status: "in_progress", qaCompletedBy: "u1", currentCycleReviewCount: 0 })
    ).toEqual({ kind: "initial" });
  });

  it("in_progress without qa_completed_by → not_ready", () => {
    const r = classifyPbdbDispatchReadiness({ status: "in_progress", qaCompletedBy: null, currentCycleReviewCount: 0 });
    expect(r.kind).toBe("not_ready");
  });

  it("dispatched + 0 current-cycle rows → redispatch (the #166 recovery case)", () => {
    expect(
      classifyPbdbDispatchReadiness({ status: "dispatched", qaCompletedBy: null, currentCycleReviewCount: 0 })
    ).toEqual({ kind: "redispatch" });
  });

  it("revision_required + 0 current-cycle rows → redispatch", () => {
    expect(
      classifyPbdbDispatchReadiness({ status: "revision_required", qaCompletedBy: null, currentCycleReviewCount: 0 })
    ).toEqual({ kind: "redispatch" });
  });

  it("dispatched WITH current-cycle rows → not_ready (genuinely mid-review)", () => {
    const r = classifyPbdbDispatchReadiness({ status: "dispatched", qaCompletedBy: null, currentCycleReviewCount: 3 });
    expect(r.kind).toBe("not_ready");
  });

  it("terminal / other statuses → not_ready", () => {
    for (const status of ["draft", "submitted", "assigned", "converting", "delivered", "complete", "paused"]) {
      expect(
        classifyPbdbDispatchReadiness({ status, qaCompletedBy: "u1", currentCycleReviewCount: 0 }).kind
      ).toBe("not_ready");
    }
  });
});
