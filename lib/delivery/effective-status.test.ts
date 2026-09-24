import { describe, it, expect } from "vitest";
import { resolveEffectiveStatus, resolveStaffStatus } from "./effective-status";

describe("resolveEffectiveStatus", () => {
  it("passes through any non-dispatched status unchanged", () => {
    expect(resolveEffectiveStatus("submitted", [])).toBe("submitted");
    expect(resolveEffectiveStatus("in_progress", [{ status: "approved_without_comments" }])).toBe(
      "in_progress"
    );
    expect(resolveEffectiveStatus("delivered", [])).toBe("delivered");
  });

  it("stays dispatched when there are no reviews yet", () => {
    expect(resolveEffectiveStatus("dispatched", [])).toBe("dispatched");
  });

  it("stays dispatched while any review is still pending", () => {
    expect(
      resolveEffectiveStatus("dispatched", [
        { status: "approved_without_comments" },
        { status: "pending" },
      ])
    ).toBe("dispatched");
  });

  it("stays dispatched while a rejection is still outstanding", () => {
    expect(
      resolveEffectiveStatus("dispatched", [
        { status: "approved_without_comments" },
        { status: "rejected_with_comments" },
      ])
    ).toBe("dispatched");
  });

  it("resolves to converting once every review has approved", () => {
    expect(
      resolveEffectiveStatus("dispatched", [
        { status: "approved_without_comments" },
        { status: "approved_with_comments" },
      ])
    ).toBe("converting");
  });
});

describe("resolveStaffStatus", () => {
  it("shows revision_required as still awaiting approval while another reviewer is pending", () => {
    expect(
      resolveStaffStatus("revision_required", [
        { status: "rejected_with_comments" },
        { status: "pending" },
      ])
    ).toBe("dispatched");
  });

  it("keeps revision_required once every reviewer has responded (round closed)", () => {
    expect(
      resolveStaffStatus("revision_required", [
        { status: "rejected_with_comments" },
        { status: "approved_without_comments" },
      ])
    ).toBe("revision_required");
  });

  it("keeps revision_required with no current-cycle rows (corrected upload awaiting redispatch, or a revert)", () => {
    expect(resolveStaffStatus("revision_required", [])).toBe("revision_required");
  });

  it("otherwise behaves like resolveEffectiveStatus", () => {
    expect(resolveStaffStatus("dispatched", [{ status: "approved_without_comments" }])).toBe("converting");
    expect(resolveStaffStatus("in_progress", [{ status: "pending" }])).toBe("in_progress");
  });
});
