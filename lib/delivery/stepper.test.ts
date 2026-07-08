import { describe, it, expect } from "vitest";
import { resolveStepperState } from "./stepper";

function base(overrides: Partial<Parameters<typeof resolveStepperState>[0]> = {}) {
  return {
    status: "submitted" as const,
    pausedPreviousStatus: null,
    reviewCycle: 1,
    pbdbDownloadedAt: null,
    showConsultantName: true,
    consultantFirstName: "Priya",
    viewerFirstName: "Jordan",
    ...overrides,
  };
}

describe("resolveStepperState", () => {
  describe("status: submitted", () => {
    it("marks stage 1 as current and the rest upcoming", () => {
      const result = resolveStepperState(base({ status: "submitted" }));
      expect(result.stages.map((s) => s.visual)).toEqual([
        "current",
        "upcoming",
        "upcoming",
        "upcoming",
        "upcoming",
      ]);
    });

    it("captions with a generic submitted message", () => {
      const result = resolveStepperState(base({ status: "submitted" }));
      expect(result.caption).toBe("Your request has been submitted");
    });
  });

  describe("status: assigned / in_progress", () => {
    it("marks stage 1 complete and stage 2 current", () => {
      const result = resolveStepperState(base({ status: "in_progress" }));
      expect(result.stages.map((s) => s.visual)).toEqual([
        "complete",
        "current",
        "upcoming",
        "upcoming",
        "upcoming",
      ]);
    });

    it("captions with the consultant's name assessing, before the PBDB is downloaded", () => {
      const result = resolveStepperState(
        base({ status: "assigned", pbdbDownloadedAt: null })
      );
      expect(result.caption).toBe("Priya is assessing your request");
    });

    it("captions with the consultant's name working on the report, once the PBDB is downloaded", () => {
      const result = resolveStepperState(
        base({ status: "in_progress", pbdbDownloadedAt: "2026-07-01T00:00:00Z" })
      );
      expect(result.caption).toBe("Priya is working on your report");
    });

    it("omits the consultant's name when the org has disabled show_consultant_name", () => {
      const result = resolveStepperState(
        base({ status: "assigned", pbdbDownloadedAt: null, showConsultantName: false })
      );
      expect(result.caption).toBe("Your request is being assessed");
    });
  });

  describe("status: dispatched", () => {
    it("marks stage 3 as current", () => {
      const result = resolveStepperState(base({ status: "dispatched" }));
      expect(result.stages.map((s) => s.visual)).toEqual([
        "complete",
        "complete",
        "current",
        "upcoming",
        "upcoming",
      ]);
    });

    it("captions with the viewer's name asking them to review the brief", () => {
      const result = resolveStepperState(base({ status: "dispatched" }));
      expect(result.caption).toBe("Jordan, please review the brief");
    });

    it("falls back to a nameless caption when no viewer name is available", () => {
      const result = resolveStepperState(base({ status: "dispatched", viewerFirstName: null }));
      expect(result.caption).toBe("Please review the brief");
    });
  });

  describe("status: delivered / complete", () => {
    it("marks stage 5 as complete", () => {
      const result = resolveStepperState(base({ status: "delivered" }));
      expect(result.stages.map((s) => s.visual)).toEqual([
        "complete",
        "complete",
        "complete",
        "complete",
        "complete",
      ]);
    });

    it("captions with the viewer's name for a delivered download", () => {
      const result = resolveStepperState(base({ status: "delivered" }));
      expect(result.caption).toBe("Jordan, the PBDR is ready for download");
    });

    it("treats complete the same as delivered", () => {
      const result = resolveStepperState(base({ status: "complete" }));
      expect(result.caption).toBe("Jordan, the PBDR is ready for download");
      expect(result.stages.map((s) => s.visual)).toEqual([
        "complete",
        "complete",
        "complete",
        "complete",
        "complete",
      ]);
    });
  });

  describe("status: converting", () => {
    it("renders stage 5 as current (in-progress), not complete — no implied delivery", () => {
      const result = resolveStepperState(base({ status: "converting" }));
      expect(result.stages.map((s) => s.visual)).toEqual([
        "complete",
        "complete",
        "complete",
        "complete",
        "current",
      ]);
    });

    it("captions that the report is being finalized", () => {
      const result = resolveStepperState(base({ status: "converting" }));
      expect(result.caption).toBe("Finalizing your report");
    });
  });

  describe("status: revision_required", () => {
    it("swaps stage 2 to the Revising label/icon and marks stage 3 as revision-pending", () => {
      const result = resolveStepperState(base({ status: "revision_required" }));
      expect(result.stages[0].visual).toBe("complete");
      expect(result.stages[1]).toMatchObject({
        visual: "revision-current",
        label: "Revising",
        icon: "refresh",
      });
      expect(result.stages[2]).toMatchObject({
        visual: "revision-pending",
        label: "Awaiting your review",
        icon: "message-circle",
      });
      expect(result.stages[3].visual).toBe("upcoming");
      expect(result.stages[4].visual).toBe("upcoming");
    });

    it("shows the loop-back arrow", () => {
      const result = resolveStepperState(base({ status: "revision_required" }));
      expect(result.showRevisionLoop).toBe(true);
    });

    it("does not show the loop-back arrow for any other status", () => {
      const result = resolveStepperState(base({ status: "in_progress" }));
      expect(result.showRevisionLoop).toBe(false);
    });

    it("captions with the consultant's name reviewing the comments", () => {
      const result = resolveStepperState(base({ status: "revision_required" }));
      expect(result.caption).toBe(
        "Priya will review your comments and make the appropriate changes"
      );
    });

    it("omits the consultant's name when the org has disabled show_consultant_name", () => {
      const result = resolveStepperState(
        base({ status: "revision_required", showConsultantName: false })
      );
      expect(result.caption).toBe(
        "Consultant will review your comments and make the appropriate changes"
      );
    });
  });

  describe("status: paused", () => {
    it("resolves the displayed stage from paused_previous_status, since 'paused' isn't a stage itself", () => {
      const result = resolveStepperState(
        base({ status: "paused", pausedPreviousStatus: "dispatched" })
      );
      expect(result.stages.map((s) => s.visual)).toEqual([
        "complete",
        "complete",
        "current",
        "upcoming",
        "upcoming",
      ]);
    });

    it("sets isPaused true", () => {
      const result = resolveStepperState(
        base({ status: "paused", pausedPreviousStatus: "dispatched" })
      );
      expect(result.isPaused).toBe(true);
    });

    it("is false for any non-paused status", () => {
      const result = resolveStepperState(base({ status: "dispatched" }));
      expect(result.isPaused).toBe(false);
    });

    it("resolves a paused mid-revision project through both the previous-status lookup and the revision loop-back", () => {
      const result = resolveStepperState(
        base({ status: "paused", pausedPreviousStatus: "revision_required" })
      );
      expect(result.isPaused).toBe(true);
      expect(result.showRevisionLoop).toBe(true);
      expect(result.stages[1].visual).toBe("revision-current");
    });
  });

  describe("Round N badge", () => {
    it("is null on review_cycle 1", () => {
      const result = resolveStepperState(base({ status: "in_progress", reviewCycle: 1 }));
      expect(result.roundBadge).toBeNull();
    });

    it("shows during revision_required itself", () => {
      const result = resolveStepperState(base({ status: "revision_required", reviewCycle: 2 }));
      expect(result.roundBadge).toBe(2);
    });

    it("keeps showing through the whole round-2+ in_progress pass, not just during the revision request", () => {
      const result = resolveStepperState(base({ status: "in_progress", reviewCycle: 2 }));
      expect(result.roundBadge).toBe(2);
    });

    it("keeps showing through a round-2+ dispatched review", () => {
      const result = resolveStepperState(base({ status: "dispatched", reviewCycle: 3 }));
      expect(result.roundBadge).toBe(3);
    });
  });
});
