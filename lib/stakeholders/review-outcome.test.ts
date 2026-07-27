import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email/templates/ModificationsRequestedEmail", () => ({
  renderModificationsRequestedEmail: vi.fn().mockReturnValue("<html></html>"),
}));
vi.mock("@/lib/documents/pending-delivery", () => ({
  scheduleOrDeliverPbdr: vi.fn().mockResolvedValue(undefined),
}));

import { resolveProjectRef, autoDeliverIfFullyApproved } from "./review-outcome";
import { scheduleOrDeliverPbdr } from "@/lib/documents/pending-delivery";

function chain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error });
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.in = self;
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  return obj;
}

beforeEach(() => {
  vi.mocked(scheduleOrDeliverPbdr).mockClear();
});

describe("resolveProjectRef", () => {
  it("prefers the extracted site address", () => {
    expect(
      resolveProjectRef(
        { extracted_fields: { EXTRACT_ADDRESS: "12 Main St" }, project_number: "P-1" },
        "11111111-2222"
      )
    ).toBe("12 Main St");
  });

  it("falls back to the project number, then a short id", () => {
    expect(resolveProjectRef({ extracted_fields: null, project_number: "P-1" }, "11111111-2222")).toBe("P-1");
    expect(resolveProjectRef({ extracted_fields: null, project_number: null }, "11111111-2222")).toBe(
      "11111111"
    );
  });
});

describe("autoDeliverIfFullyApproved", () => {
  it("triggers delivery once no review is pending or still-rejected", async () => {
    const supabase = { from: vi.fn(() => chain([])) };
    await autoDeliverIfFullyApproved(supabase as never, "proj-1", 1, "[test]");
    expect(scheduleOrDeliverPbdr).toHaveBeenCalledWith("proj-1");
  });

  // Regression: two of the three call sites (portalApproval.ts,
  // stakeholders.ts) used to only check for `status: "pending"`, which meant
  // a stakeholder approving after another had already rejected (leaving a
  // `rejected_with_comments` row on the same cycle) would incorrectly count
  // as "fully approved" and auto-trigger delivery.
  it("does not trigger delivery while a rejected review is still outstanding", async () => {
    const supabase = { from: vi.fn(() => chain([{ id: "review-2" }])) };
    await autoDeliverIfFullyApproved(supabase as never, "proj-1", 1, "[test]");
    expect(scheduleOrDeliverPbdr).not.toHaveBeenCalled();
  });
});
