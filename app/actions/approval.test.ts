import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/stakeholders/tokens");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/notifications/notify");
vi.mock("@/lib/email/templates/ModificationsRequestedEmail");
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { submitApproval } from "./approval";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateToken } from "@/lib/stakeholders/tokens";
import { notify } from "@/lib/notifications/notify";
import { renderModificationsRequestedEmail } from "@/lib/email/templates/ModificationsRequestedEmail";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

function chain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error });
  const self = () => obj;
  obj.select = self; obj.eq = self; obj.is = self; obj.in = self;
  obj.order = self; obj.limit = self; obj.not = self;
  obj.single = resolve; obj.maybeSingle = resolve;
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  obj.catch = () => obj;
  return obj;
}

const VALID_REVIEW = {
  id: "review-1",
  project_id: "proj-1",
  review_cycle: 1,
  stakeholder_email: "jane@example.com",
  stakeholder_name: "Jane Smith",
  token: "valid-token",
  status: "pending",
  expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
  comments: null,
  responded_at: null,
};

const BASE_PROJECT = {
  submitted_by: "submitter-1",
  review_cycle: 1,
  extracted_fields: null,
  project_number: "OPS-001",
  assigned_consultant_id: "consultant-1",
};

function buildMock({
  reviewUpdateError = null,
  secondaryReviews = [] as unknown[],
  admins = [{ id: "admin-1" }] as unknown[],
  recipients = [{ id: "consultant-1", first_name: "Alex" }, { id: "admin-1", first_name: "Super" }] as unknown[],
} = {}) {
  const calls: Record<string, number> = {};

  const updateReview = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: reviewUpdateError }),
  });
  const updateProject = vi.fn().mockReturnValue(chain(null));

  return {
    updateReview,
    updateProject,
    from: vi.fn((table: string) => {
      calls[table] = (calls[table] ?? 0) + 1;
      const n = calls[table];

      if (table === "stakeholder_reviews") {
        if (n === 1) return { update: updateReview };
        return chain(secondaryReviews);
      }

      if (table === "projects") {
        if (n === 1) return { update: updateProject };
        if (n === 2) return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: BASE_PROJECT, error: null }),
        };
        return { update: updateProject };
      }

      if (table === "users") {
        if (n === 1) return chain(admins);
        return chain(recipients);
      }

      return chain(null);
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(renderModificationsRequestedEmail).mockReturnValue("<html>mods</html>");
  vi.mocked(notify).mockResolvedValue(undefined);
});

// ─── Input validation ─────────────────────────────────────────────────────────

describe("submitApproval — input validation", () => {
  it("returns an error when no response is selected", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: false });
    const result = await submitApproval("tok", null, {}, makeFormData({}));
    expect(result.error).toBeTruthy();
    expect(result.submitted).toBeUndefined();
  });

  it("returns an error when response is an invalid value", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: false });
    const result = await submitApproval("tok", null, {}, makeFormData({ response: "maybe" }));
    expect(result.error).toMatch(/select a response/i);
  });

  it("returns an error for an invalid token", async () => {
    vi.mocked(validateToken).mockResolvedValue(null);
    const result = await submitApproval("bad", null, {}, makeFormData({ response: "approved" }));
    expect(result.error).toMatch(/invalid/i);
  });

  it("returns an error for an expired token", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: true });
    const result = await submitApproval("exp", null, {}, makeFormData({ response: "approved" }));
    expect(result.error).toMatch(/expired/i);
  });
});

// ─── Approved path ────────────────────────────────────────────────────────────

describe("submitApproval — approved", () => {
  beforeEach(() => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: false });
  });

  it("returns submitted=true and response=approved", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock() as never);
    const result = await submitApproval("tok", null, {}, makeFormData({ response: "approved" }));
    expect(result.submitted).toBe(true);
    expect(result.response).toBe("approved");
  });

  it("stores approved_without_comments when no comments provided", async () => {
    const mock = buildMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    await submitApproval("tok", null, {}, makeFormData({ response: "approved" }));
    expect(mock.updateReview).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved_without_comments" })
    );
  });

  it("stores approved_with_comments when comments provided", async () => {
    const mock = buildMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    await submitApproval("tok", null, {}, makeFormData({ response: "approved", comments: "Looks good overall." }));
    expect(mock.updateReview).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved_with_comments", comments: "Looks good overall." })
    );
  });

  it("does not send a rejection notification on approved", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock() as never);
    await submitApproval("tok", null, {}, makeFormData({ response: "approved" }));
    const rejCalls = vi.mocked(notify).mock.calls.filter((c) => c[0].type === "modifications_requested");
    expect(rejCalls).toHaveLength(0);
  });

  it("notifies admins when all stakeholders have approved", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMock({ secondaryReviews: [], admins: [{ id: "admin-1" }] }) as never
    );
    await submitApproval("tok", null, {}, makeFormData({ response: "approved" }));
    const allAck = vi.mocked(notify).mock.calls.filter((c) => c[0].type === "all_acknowledged");
    expect(allAck.length).toBeGreaterThan(0);
  });

  it("does not notify all_acknowledged when other stakeholders are still pending", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMock({ secondaryReviews: [{ id: "review-2" }] }) as never
    );
    await submitApproval("tok", null, {}, makeFormData({ response: "approved" }));
    const allAck = vi.mocked(notify).mock.calls.filter((c) => c[0].type === "all_acknowledged");
    expect(allAck).toHaveLength(0);
  });
});

// ─── Rejected path ────────────────────────────────────────────────────────────

describe("submitApproval — rejected", () => {
  beforeEach(() => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: false });
  });

  it("returns submitted=true and response=rejected", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock() as never);
    const result = await submitApproval("tok", null, {}, makeFormData({
      response: "rejected",
      comments: "Fix page 3.",
    }));
    expect(result.submitted).toBe(true);
    expect(result.response).toBe("rejected");
  });

  it("stores rejected_with_comments when comments provided", async () => {
    const mock = buildMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    await submitApproval("tok", null, {}, makeFormData({ response: "rejected", comments: "Fix page 3." }));
    expect(mock.updateReview).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected_with_comments", comments: "Fix page 3." })
    );
  });

  it("returns an error when rejected without comments", async () => {
    const result = await submitApproval("tok", null, {}, makeFormData({ response: "rejected" }));
    expect(result.error).toMatch(/describe what needs to be changed/i);
  });

  it("sends a rejection notification", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock() as never);
    await submitApproval("tok", null, {}, makeFormData({ response: "rejected", comments: "Fix page 3." }));
    const rejCalls = vi.mocked(notify).mock.calls.filter((c) => c[0].type === "modifications_requested");
    expect(rejCalls.length).toBeGreaterThan(0);
  });

  it("renders the aggregated modifications email when rejections have comments", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMock({ secondaryReviews: [{ stakeholder_name: "Jane", comments: "Fix page 3." }] }) as never
    );
    await submitApproval("tok", null, {}, makeFormData({ response: "rejected", comments: "Fix page 3." }));
    expect(vi.mocked(renderModificationsRequestedEmail)).toHaveBeenCalled();
  });

  it("passes all aggregated rejections with comments to the email renderer", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMock({
        secondaryReviews: [
          { stakeholder_name: "Jane", comments: "Fix page 3." },
          { stakeholder_name: "Bob", comments: "Update the title." },
        ],
      }) as never
    );
    await submitApproval("tok", null, {}, makeFormData({ response: "rejected", comments: "Fix page 3." }));
    const call = vi.mocked(renderModificationsRequestedEmail).mock.calls[0][0];
    expect(call.modifications).toHaveLength(2);
    expect(call.modifications[0].stakeholderName).toBe("Jane");
    expect(call.modifications[1].stakeholderName).toBe("Bob");
  });
});
