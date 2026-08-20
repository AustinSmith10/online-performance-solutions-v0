import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/stakeholders/tokens");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/notifications/notify");
vi.mock("@/lib/email/templates/ModificationsRequestedEmail");
vi.mock("@/lib/email/templates/ApprovalRequestEmail");
vi.mock("@/lib/email/sender", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/documents/pbdb-pdf");

import { submitApproval, requestNewApprovalLink } from "./approval";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  validateToken,
  generateTokenString,
  computeTokenExpiry,
  hashToken,
} from "@/lib/stakeholders/tokens";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { renderModificationsRequestedEmail } from "@/lib/email/templates/ModificationsRequestedEmail";
import { renderApprovalRequestEmail } from "@/lib/email/templates/ApprovalRequestEmail";
import { sendEmail } from "@/lib/email/sender";
import { getOrCreateDispatchPdf } from "@/lib/documents/pbdb-pdf";

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
  obj.insert = resolve;
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
  reviewUpdateCount = 1,
  secondaryReviews = [] as unknown[],
  admins = [{ id: "admin-1" }] as unknown[],
  recipients = [{ id: "consultant-1", first_name: "Alex" }, { id: "admin-1", first_name: "Super" }] as unknown[],
  guardProject = { status: "dispatched", review_cycle: 1 } as unknown,
} = {}) {
  const calls: Record<string, number> = {};

  const updateReview = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: null, error: reviewUpdateError, count: reviewUpdateCount }),
    }),
  });
  const updateProject = vi.fn().mockReturnValue(chain(null));
  const selectGuard = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: guardProject, error: null }),
    }),
  });
  const selectProject = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: BASE_PROJECT, error: null }),
    }),
  });

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
        // Call order in submitApproval: 1) replay guard select, 2) first_response_at
        // update, 3) select for downstream fields, 4) rejected-path status update,
        // 5) recordRevisionEvent's assigned_consultant_id lookup (rejected path only).
        if (n === 1) return { select: selectGuard };
        if (n === 2) return { update: updateProject };
        if (n === 3) return { select: selectProject };
        if (n === 4) return { update: updateProject };
        return chain(BASE_PROJECT);
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
      expect.objectContaining({ status: "approved_without_comments" }),
      { count: "exact" }
    );
  });

  it("stores approved_with_comments when comments provided", async () => {
    const mock = buildMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    await submitApproval("tok", null, {}, makeFormData({ response: "approved", comments: "Looks good overall." }));
    expect(mock.updateReview).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved_with_comments", comments: "Looks good overall." }),
      { count: "exact" }
    );
  });

  it("does not send a rejection notification on approved", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock() as never);
    await submitApproval("tok", null, {}, makeFormData({ response: "approved" }));
    const rejCalls = vi.mocked(notify).mock.calls.filter((c) => c[0].type === "modifications_requested");
    expect(rejCalls).toHaveLength(0);
  });

  // A different stakeholder in the same cycle already rejected, flipping
  // project.status to "revision_required" — this stakeholder's own review is
  // still "pending" (VALID_REVIEW) in the same cycle, so their submission
  // must still succeed rather than being told the project "is no longer
  // awaiting review."
  it("still succeeds when project.status is revision_required (another stakeholder already rejected)", async () => {
    const mock = buildMock({ guardProject: { status: "revision_required", review_cycle: 1 } });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    const result = await submitApproval("tok", null, {}, makeFormData({ response: "approved" }));
    expect(result.submitted).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("still blocks a genuinely closed status (e.g. converting)", async () => {
    const mock = buildMock({ guardProject: { status: "converting", review_cycle: 1 } });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    const result = await submitApproval("tok", null, {}, makeFormData({ response: "approved" }));
    expect(result.error).toMatch(/no longer awaiting review/i);
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
      expect.objectContaining({ status: "rejected_with_comments", comments: "Fix page 3." }),
      { count: "exact" }
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

  // A second stakeholder rejecting the same cycle must not bump the PBDB
  // revision_history counter a second time — otherwise Rev numbers skip
  // ahead of the actual cycle count (e.g. Rev0 -> Rev2 after only one real
  // reupload cycle) whenever more than one stakeholder rejects before the
  // consultant re-uploads.
  it("does not record a second revision_history row when another stakeholder already rejected this cycle", async () => {
    const mock = buildMock({ guardProject: { status: "revision_required", review_cycle: 1 } });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    const result = await submitApproval("tok", null, {}, makeFormData({
      response: "rejected",
      comments: "Also fix page 5.",
    }));
    expect(result.submitted).toBe(true);
    expect(mock.from).not.toHaveBeenCalledWith("revision_history");
  });

  it("records a revision_history row on the cycle's first rejection", async () => {
    const mock = buildMock({ guardProject: { status: "dispatched", review_cycle: 1 } });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    await submitApproval("tok", null, {}, makeFormData({ response: "rejected", comments: "Fix page 3." }));
    expect(mock.from).toHaveBeenCalledWith("revision_history");
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

// ─── requestNewApprovalLink ────────────────────────────────────────────────────

describe("requestNewApprovalLink", () => {
  const CURRENT_REVIEW = {
    id: "review-current",
    token_hash: "hash-of-expired-token",
    status: "pending",
    stakeholder_name: "Jane Smith",
    stakeholder_email: "jane@example.com",
  };

  function buildReissueMock({
    project = { review_cycle: 1, clients: { state_territory: "NSW" } } as unknown,
    currentReview = CURRENT_REVIEW as unknown,
    updateCount = 1,
  } = {}) {
    const updateEqId = vi.fn();
    const updateEqTokenHash = vi.fn().mockResolvedValue({ data: null, error: null, count: updateCount });
    updateEqId.mockReturnValue({ eq: updateEqTokenHash });
    const updateReview = vi.fn().mockReturnValue({ eq: updateEqId });
    const selectProject = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: project, error: null }),
      }),
    });
    const selectCurrentReview = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: currentReview, error: null }),
          }),
        }),
      }),
    });

    return {
      updateReview,
      updateEqId,
      updateEqTokenHash,
      from: vi.fn((table: string) => {
        if (table === "projects") return { select: selectProject };
        if (table === "stakeholder_reviews") {
          // First call resolves the current-cycle row; second issues the update.
          return { select: selectCurrentReview, update: updateReview };
        }
        return chain(null);
      }),
    };
  }

  beforeEach(() => {
    vi.mocked(generateTokenString).mockReturnValue("new-token");
    vi.mocked(hashToken).mockImplementation((t: string) => `hash-of-${t}`);
    vi.mocked(computeTokenExpiry).mockResolvedValue(new Date(Date.now() + 5 * 24 * 60 * 60 * 1000));
    vi.mocked(renderApprovalRequestEmail).mockReturnValue("<html>reissue</html>");
    vi.mocked(getOrCreateDispatchPdf).mockResolvedValue({
      storagePath: "org-1/proj-1/pbdb/v1_file.pdf",
      originalFilename: "file.pdf",
    });
  });

  it("errors on an invalid token", async () => {
    vi.mocked(validateToken).mockResolvedValue(null);
    const result = await requestNewApprovalLink("bad", {}, makeFormData({}));
    expect(result.error).toBeTruthy();
  });

  it("errors when the token is not actually expired", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: false });
    const result = await requestNewApprovalLink("tok", {}, makeFormData({}));
    expect(result.error).toMatch(/not eligible|no longer eligible/i);
  });

  it("errors when the review already has a recorded response", async () => {
    vi.mocked(validateToken).mockResolvedValue({
      review: { ...VALID_REVIEW, status: "approved_without_comments" } as never,
      isExpired: true,
    });
    const result = await requestNewApprovalLink("tok", {}, makeFormData({}));
    expect(result.error).toBeTruthy();
  });

  it("reissues a token and sends an email on success", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: true });
    const mock = buildReissueMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await requestNewApprovalLink("expired-token", {}, makeFormData({}));

    expect(result.sent).toBe(true);
    expect(mock.updateReview).toHaveBeenCalledWith(
      expect.objectContaining({ token: "new-token" }),
      { count: "exact" }
    );
    expect(vi.mocked(sendEmail)).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com" })
    );
    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "stakeholder.token_self_reissued",
      null,
      "jane@example.com",
      expect.objectContaining({ projectId: "proj-1" })
    );
  });

  it("reissues against the current cycle's row, not the stale expired one", async () => {
    vi.mocked(validateToken).mockResolvedValue({
      review: { ...VALID_REVIEW, review_cycle: 1 } as never,
      isExpired: true,
    });
    const mock = buildReissueMock({
      project: { review_cycle: 2, clients: { state_territory: "NSW" } },
      currentReview: { ...CURRENT_REVIEW, id: "review-cycle-2" },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await requestNewApprovalLink("expired-token", {}, makeFormData({}));
    expect(result.sent).toBe(true);
  });

  it("does not reissue when the current-cycle review is not pending", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: true });
    const mock = buildReissueMock({ currentReview: { ...CURRENT_REVIEW, status: "waived" } });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await requestNewApprovalLink("expired-token", {}, makeFormData({}));
    expect(result.error).toBeTruthy();
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("does not leak enumeration info when the update race loses (count 0)", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: true });
    const mock = buildReissueMock({ updateCount: 0 });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await requestNewApprovalLink("expired-token", {}, makeFormData({}));
    expect(result.error).toBeTruthy();
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  // #159 — the CAS used to read back the plaintext `token` from a prior SELECT
  // and match the UPDATE on it; it must now do the equivalent against
  // `token_hash` on both sides, never touching plaintext at all.
  it("matches the compare-and-swap update on token_hash, not plaintext token", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: true });
    const mock = buildReissueMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await requestNewApprovalLink("expired-token", {}, makeFormData({}));

    expect(result.sent).toBe(true);
    // The write payload sets a fresh token_hash alongside the new plaintext token.
    expect(mock.updateReview).toHaveBeenCalledWith(
      expect.objectContaining({ token: "new-token", token_hash: "hash-of-new-token" }),
      { count: "exact" }
    );
    // The CAS match condition is the *current* review's own token_hash — never
    // the plaintext token, and never re-derived from the new token.
    expect(mock.updateEqId).toHaveBeenCalledWith("id", CURRENT_REVIEW.id);
    expect(mock.updateEqTokenHash).toHaveBeenCalledWith("token_hash", CURRENT_REVIEW.token_hash);
  });

  // #133 — this is the one link-issuing path that used to skip verifying the
  // PBDB PDF exists for the current cycle, which could hand out a link to a
  // page with a broken Download button.
  it("verifies/regenerates the PBDB PDF for the current cycle before sending the reissue email", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: true });
    const mock = buildReissueMock({
      project: {
        review_cycle: 1,
        client_id: "client-1",
        strip_token_color: true,
        project_number: "OPS-001",
        extracted_fields: { EXTRACT_ADDRESS: "1 Main St" },
        clients: { state_territory: "NSW" },
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await requestNewApprovalLink("expired-token", {}, makeFormData({}));

    expect(result.sent).toBe(true);
    expect(vi.mocked(getOrCreateDispatchPdf)).toHaveBeenCalledWith(
      mock,
      expect.objectContaining({
        id: "proj-1",
        client_id: "client-1",
        review_cycle: 1,
        strip_token_color: true,
        project_number: "OPS-001",
        extracted_fields: { EXTRACT_ADDRESS: "1 Main St" },
      }),
      null
    );
    // Called before the reissue email is sent.
    const pdfCallOrder = vi.mocked(getOrCreateDispatchPdf).mock.invocationCallOrder[0];
    const emailCallOrder = vi.mocked(sendEmail).mock.invocationCallOrder[0];
    expect(pdfCallOrder).toBeLessThan(emailCallOrder);
  });

  it("still sends the reissue email when no source docx exists for the cycle", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: true });
    vi.mocked(getOrCreateDispatchPdf).mockResolvedValue(null);
    const mock = buildReissueMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await requestNewApprovalLink("expired-token", {}, makeFormData({}));

    expect(result.sent).toBe(true);
    expect(vi.mocked(sendEmail)).toHaveBeenCalled();
  });

  it("still sends the reissue email even if PDF verification/regeneration throws", async () => {
    vi.mocked(validateToken).mockResolvedValue({ review: VALID_REVIEW as never, isExpired: true });
    vi.mocked(getOrCreateDispatchPdf).mockRejectedValue(new Error("conversion failed"));
    const mock = buildReissueMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    const result = await requestNewApprovalLink("expired-token", {}, makeFormData({}));

    expect(result.sent).toBe(true);
    expect(vi.mocked(sendEmail)).toHaveBeenCalled();
  });
});
