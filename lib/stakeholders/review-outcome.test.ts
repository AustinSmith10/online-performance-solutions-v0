import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email/templates/ModificationsRequestedEmail", () => ({
  renderModificationsRequestedEmail: vi.fn().mockReturnValue("<html></html>"),
}));
vi.mock("@/lib/email/templates/AllApprovedEmail", () => ({
  renderAllApprovedEmail: vi.fn().mockReturnValue("<html></html>"),
}));
vi.mock("@/lib/documents/pending-delivery", () => ({
  scheduleOrDeliverPbdr: vi.fn().mockResolvedValue(undefined),
}));

import { resolveProjectRef, autoDeliverIfFullyApproved } from "./review-outcome";
import { scheduleOrDeliverPbdr } from "@/lib/documents/pending-delivery";
import { notify } from "@/lib/notifications/notify";

function chain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error });
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.in = self;
  obj.single = () => resolve();
  obj.maybeSingle = () => resolve();
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  return obj;
}

// Table-routed supabase mock: stakeholder_reviews gets `outstanding`, projects
// and users get whatever notifySubmitterAllApproved needs to build the email.
function makeSupabase(opts: {
  outstanding: unknown[];
  project?: { submitted_by: string | null; project_number: string | null; extracted_fields: unknown };
  submitter?: { first_name: string | null };
}) {
  const project = opts.project ?? {
    submitted_by: "submitter-1",
    project_number: "P-1",
    extracted_fields: null,
  };
  const submitter = opts.submitter ?? { first_name: "Macky" };
  return {
    from: vi.fn((table: string) => {
      if (table === "stakeholder_reviews") return chain(opts.outstanding);
      if (table === "projects") return chain(project);
      if (table === "users") return chain(submitter);
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
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
    const supabase = makeSupabase({ outstanding: [] });
    await autoDeliverIfFullyApproved(supabase as never, "proj-1", 1, "[test]");
    expect(scheduleOrDeliverPbdr).toHaveBeenCalledWith("proj-1");
  });

  // Regression: two of the three call sites (portalApproval.ts,
  // stakeholders.ts) used to only check for `status: "pending"`, which meant
  // a stakeholder approving after another had already rejected (leaving a
  // `rejected_with_comments` row on the same cycle) would incorrectly count
  // as "fully approved" and auto-trigger delivery.
  it("does not trigger delivery while a rejected review is still outstanding", async () => {
    const supabase = makeSupabase({ outstanding: [{ id: "review-2" }] });
    await autoDeliverIfFullyApproved(supabase as never, "proj-1", 1, "[test]");
    expect(scheduleOrDeliverPbdr).not.toHaveBeenCalled();
  });

  it("notifies the submitter, not every org stakeholder, once fully approved", async () => {
    const supabase = makeSupabase({
      outstanding: [],
      project: { submitted_by: "submitter-1", project_number: null, extracted_fields: { EXTRACT_ADDRESS: "12 Main St" } },
      submitter: { first_name: "Macky" },
    });

    await autoDeliverIfFullyApproved(supabase as never, "proj-1", 1, "[test]");
    // Fire-and-forget inside autoDeliverIfFullyApproved — flush microtasks.
    await new Promise((r) => setTimeout(r, 0));

    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "submitter-1",
        type: "all_acknowledged",
        projectId: "proj-1",
        emailSubject: "All approvals in — 12 Main St",
      })
    );
  });

  it("does not notify anyone when a review is still outstanding", async () => {
    const supabase = makeSupabase({ outstanding: [{ id: "review-2" }] });
    await autoDeliverIfFullyApproved(supabase as never, "proj-1", 1, "[test]");
    await new Promise((r) => setTimeout(r, 0));

    expect(notify).not.toHaveBeenCalled();
  });
});
