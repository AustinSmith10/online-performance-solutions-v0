import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/stakeholders/buffer-update");

import { resendStakeholderStatusUpdate } from "./stakeholders";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { sendStakeholderBufferUpdate } from "@/lib/stakeholders/buffer-update";

const PROJECT_ID = "proj-1";

function makeQuery(project: Record<string, unknown> | null) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }),
  };
  return builder;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auditLog).mockResolvedValue(undefined as never);
});

describe("resendStakeholderStatusUpdate", () => {
  const DISPATCHED_PROJECT = {
    id: PROJECT_ID,
    status: "dispatched",
    review_cycle: 2,
    assigned_consultant_id: "consultant-1",
    clients: { state_territory: "NSW" },
  };

  it("returns an error when the project isn't found", async () => {
    vi.mocked(requireRole).mockResolvedValue({ id: "admin-1", email: "admin@x.com", role: "super_admin" } as never);
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(makeQuery(null)) } as never);

    const result = await resendStakeholderStatusUpdate(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ error: "Project not found." });
    expect(sendStakeholderBufferUpdate).not.toHaveBeenCalled();
  });

  it("scopes a consultant to their own assigned project — not found if unassigned", async () => {
    vi.mocked(requireRole).mockResolvedValue({ id: "consultant-2", email: "other@x.com", role: "consultant" } as never);
    // Simulates the .eq("assigned_consultant_id", actor.id) filter excluding this row
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(makeQuery(null)) } as never);

    const result = await resendStakeholderStatusUpdate(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ error: "Project not found." });
  });

  it("rejects when the project is not currently dispatched", async () => {
    vi.mocked(requireRole).mockResolvedValue({ id: "admin-1", email: "admin@x.com", role: "super_admin" } as never);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(makeQuery({ ...DISPATCHED_PROJECT, status: "revision_required" })),
    } as never);

    const result = await resendStakeholderStatusUpdate(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ error: "This project is not currently awaiting stakeholder review." });
    expect(sendStakeholderBufferUpdate).not.toHaveBeenCalled();
  });

  it("returns an error when there are no stakeholder reviews for the cycle", async () => {
    vi.mocked(requireRole).mockResolvedValue({ id: "admin-1", email: "admin@x.com", role: "super_admin" } as never);
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(makeQuery(DISPATCHED_PROJECT)) } as never);
    vi.mocked(sendStakeholderBufferUpdate).mockResolvedValue(null);

    const result = await resendStakeholderStatusUpdate(PROJECT_ID, {}, new FormData());

    expect(result).toEqual({ error: "No stakeholder reviews found for this cycle." });
  });

  it("sends the update, audit-logs it, and reports the counts on success", async () => {
    const actor = { id: "admin-1", email: "admin@x.com", role: "super_admin" };
    vi.mocked(requireRole).mockResolvedValue(actor as never);
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(makeQuery(DISPATCHED_PROJECT)) } as never);
    vi.mocked(sendStakeholderBufferUpdate).mockResolvedValue({ total: 3, responded: 1, freshTokensIssued: 2 });

    const result = await resendStakeholderStatusUpdate(PROJECT_ID, {}, new FormData());

    expect(sendStakeholderBufferUpdate).toHaveBeenCalledWith(
      expect.anything(),
      PROJECT_ID,
      2,
      "NSW",
      "[manual-buffer-resend]"
    );
    expect(result).toEqual({ sent: true, total: 3, responded: 1 });
    expect(auditLog).toHaveBeenCalledWith(
      "stakeholder.buffer_update_resent",
      actor.id,
      actor.email,
      expect.objectContaining({
        projectId: PROJECT_ID,
        metadata: { total: 3, responded: 1, fresh_tokens_issued: 2 },
      })
    );
  });

  it("allows a consultant assigned to the project to trigger the resend", async () => {
    vi.mocked(requireRole).mockResolvedValue({ id: "consultant-1", email: "c@x.com", role: "consultant" } as never);
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(makeQuery(DISPATCHED_PROJECT)) } as never);
    vi.mocked(sendStakeholderBufferUpdate).mockResolvedValue({ total: 2, responded: 0, freshTokensIssued: 2 });

    const result = await resendStakeholderStatusUpdate(PROJECT_ID, {}, new FormData());

    expect(result.sent).toBe(true);
  });
});
