import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/notifications/notify");
vi.mock("@/lib/documents/revision-history");
vi.mock("@/lib/stakeholders/review-outcome");
vi.mock("@/lib/email/templates/ReviewResponseConfirmationEmail");

import { submitPortalApproval } from "./portalApproval";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { recordRevisionEvent } from "@/lib/documents/revision-history";
import {
  resolveProjectRef,
  notifyModificationsRequested,
  notifyIfFullyApproved,
} from "@/lib/stakeholders/review-outcome";
import { renderReviewResponseConfirmationEmail } from "@/lib/email/templates/ReviewResponseConfirmationEmail";

const USER = { id: "user-1", email: "jane@example.com", first_name: "Jane", last_name: "Smith" };
const REVIEW = {
  id: "review-1",
  project_id: "proj-1",
  stakeholder_email: "jane@example.com",
  stakeholder_name: "Jane Smith",
  status: "pending",
  review_cycle: 1,
};
const PROJECT_GUARD = { status: "dispatched", review_cycle: 1 };
const PROJECT_FULL = {
  review_cycle: 1,
  extracted_fields: null,
  project_number: "OPS-001",
  assigned_consultant_id: "consultant-1",
  qa_completed_by: null,
};

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error, count });
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.is = self;
  obj.in = self;
  obj.update = self;
  obj.single = resolve;
  obj.maybeSingle = resolve;
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  return obj;
}

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

function buildMock({ guardProject = PROJECT_GUARD as unknown } = {}) {
  const calls: Record<string, number> = {};
  const from = vi.fn((table: string) => {
    calls[table] = (calls[table] ?? 0) + 1;
    const n = calls[table];

    if (table === "stakeholder_reviews") {
      if (n === 1) return chain(REVIEW);
      // status update call
      return chain(null, null, 1);
    }

    if (table === "projects") {
      // 1) guard select, 2) first_response_at update, 3) select downstream,
      // 4) rejected-path status update
      if (n === 1) return chain(guardProject);
      if (n === 2) return chain(null);
      if (n === 3) return chain(PROJECT_FULL);
      return chain(null);
    }

    return chain(null);
  });

  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue(USER as never);
  vi.mocked(auditLog).mockResolvedValue(undefined as never);
  vi.mocked(notify).mockResolvedValue(undefined as never);
  vi.mocked(recordRevisionEvent).mockResolvedValue(1 as never);
  vi.mocked(resolveProjectRef).mockReturnValue("OPS-001" as never);
  vi.mocked(notifyModificationsRequested).mockResolvedValue(undefined as never);
  vi.mocked(notifyIfFullyApproved).mockResolvedValue(undefined as never);
  vi.mocked(renderReviewResponseConfirmationEmail).mockReturnValue("<html></html>");
});

describe("submitPortalApproval — rejection records revision_history", () => {
  it("calls recordRevisionEvent(pbdb, rejected) when a stakeholder rejects via the portal", async () => {
    const mock = buildMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await submitPortalApproval(
      "review-1",
      {},
      makeFormData({ response: "rejected", comments: "Please fix page 3." })
    );

    expect(result.submitted).toBe(true);
    expect(result.response).toBe("rejected");
    expect(recordRevisionEvent).toHaveBeenCalledWith(mock, "proj-1", "pbdb", "rejected");
  });

  it("does not call recordRevisionEvent on approval", async () => {
    const mock = buildMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await submitPortalApproval("review-1", {}, makeFormData({ response: "approved" }));

    expect(recordRevisionEvent).not.toHaveBeenCalled();
  });

  // A second stakeholder rejecting the same cycle (project.status already
  // "revision_required" from an earlier rejection) must not bump the PBDB
  // revision_history counter again — otherwise Rev numbers skip ahead of the
  // actual cycle count.
  it("does not call recordRevisionEvent when another stakeholder already rejected this cycle", async () => {
    const mock = buildMock({ guardProject: { status: "revision_required", review_cycle: 1 } });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await submitPortalApproval(
      "review-1",
      {},
      makeFormData({ response: "rejected", comments: "Also fix page 5." })
    );

    expect(result.submitted).toBe(true);
    expect(recordRevisionEvent).not.toHaveBeenCalled();
  });
});
