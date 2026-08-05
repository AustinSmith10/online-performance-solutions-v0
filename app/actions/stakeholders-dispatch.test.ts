import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/documents/pending-delivery");

import { dispatchToStakeholders } from "./stakeholders";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleOrDeliverPbdb } from "@/lib/documents/pending-delivery";

const PROJECT_ID = "proj-1";

/** Builds a supabase mock: the "projects" select, the redispatch path's
 * "stakeholder_reviews" count query, and the #112 findings-gate lookup on
 * "project_files" (defaults to a clean file with nothing to acknowledge). */
function buildMock(
  project: Record<string, unknown> | null,
  reviewCount = 0,
  latestPbdbFile: Record<string, unknown> | null = null
) {
  const from = vi.fn((table: string) => {
    if (table === "projects") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }),
      };
    }
    if (table === "stakeholder_reviews") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (fn: (v: unknown) => unknown) =>
          Promise.resolve({ count: reviewCount, error: null }).then(fn),
      };
    }
    if (table === "project_files") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: latestPbdbFile, error: null }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ id: "consultant-1", email: "c@x.com", role: "consultant" } as never);
  vi.mocked(scheduleOrDeliverPbdb).mockResolvedValue({ delivered: true, scheduledFor: null });
});

describe("dispatchToStakeholders — readiness gate", () => {
  it("dispatches when status is in_progress with qa_completed_by set (initial dispatch)", async () => {
    const project = { status: "in_progress", qa_completed_by: "consultant-1", assigned_consultant_id: "consultant-1", review_cycle: 1 };
    vi.mocked(createAdminClient).mockReturnValue(buildMock(project) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.success).toBe(true);
    expect(scheduleOrDeliverPbdb).toHaveBeenCalledWith(PROJECT_ID, "consultant-1", "c@x.com");
  });

  it("blocks when status is in_progress but qa_completed_by is not set", async () => {
    const project = { status: "in_progress", qa_completed_by: null, assigned_consultant_id: "consultant-1", review_cycle: 1 };
    vi.mocked(createAdminClient).mockReturnValue(buildMock(project) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.error).toBe("Project is not ready for dispatch.");
    expect(scheduleOrDeliverPbdb).not.toHaveBeenCalled();
  });

  it("dispatches when status is revision_required and the bumped cycle has no stakeholder_reviews rows yet (ready to redispatch)", async () => {
    const project = { status: "revision_required", qa_completed_by: null, assigned_consultant_id: "consultant-1", review_cycle: 3 };
    vi.mocked(createAdminClient).mockReturnValue(buildMock(project, 0) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.success).toBe(true);
    expect(scheduleOrDeliverPbdb).toHaveBeenCalledWith(PROJECT_ID, "consultant-1", "c@x.com");
  });

  it("blocks when status is revision_required but stakeholder_reviews rows already exist for the current cycle (already dispatched, mid-review)", async () => {
    const project = { status: "revision_required", qa_completed_by: null, assigned_consultant_id: "consultant-1", review_cycle: 3 };
    vi.mocked(createAdminClient).mockReturnValue(buildMock(project, 2) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.error).toBe("Project is not ready for dispatch.");
    expect(scheduleOrDeliverPbdb).not.toHaveBeenCalled();
  });

  it("blocks a genuinely closed status (e.g. dispatched, no revision in play)", async () => {
    const project = { status: "dispatched", qa_completed_by: null, assigned_consultant_id: "consultant-1", review_cycle: 1 };
    vi.mocked(createAdminClient).mockReturnValue(buildMock(project) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.error).toBe("Project is not ready for dispatch.");
    expect(scheduleOrDeliverPbdb).not.toHaveBeenCalled();
  });

  it("blocks a consultant who isn't assigned to the project", async () => {
    vi.mocked(requireRole).mockResolvedValue({ id: "someone-else", email: "x@x.com", role: "consultant" } as never);
    const project = { status: "in_progress", qa_completed_by: "consultant-1", assigned_consultant_id: "consultant-1", review_cycle: 1 };
    vi.mocked(createAdminClient).mockReturnValue(buildMock(project) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.error).toBe("You are not assigned to this project.");
    expect(scheduleOrDeliverPbdb).not.toHaveBeenCalled();
  });

  it("returns an error when the project doesn't exist", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock(null) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.error).toBe("Project not found.");
  });
});

describe("dispatchToStakeholders — QA flags gate (#112)", () => {
  it("blocks dispatch when the latest PBDB has an unacknowledged filename mismatch", async () => {
    const project = { status: "in_progress", qa_completed_by: "consultant-1", assigned_consultant_id: "consultant-1", review_cycle: 1 };
    const latestPbdbFile = { filename_mismatch_reason: "Filename says Rev1, expected Rev2.", structure_scan_findings: null, qa_flags_acknowledged_at: null };
    vi.mocked(createAdminClient).mockReturnValue(buildMock(project, 0, latestPbdbFile) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.error).toBe("Please review and acknowledge the flagged issues before sending.");
    expect(scheduleOrDeliverPbdb).not.toHaveBeenCalled();
  });

  it("blocks dispatch when the latest PBDB has unacknowledged structure-scan findings", async () => {
    const project = { status: "in_progress", qa_completed_by: "consultant-1", assigned_consultant_id: "consultant-1", review_cycle: 1 };
    const latestPbdbFile = { filename_mismatch_reason: null, structure_scan_findings: [{ kind: "tracked_changes", count: 1, message: "1 tracked change found" }], qa_flags_acknowledged_at: null };
    vi.mocked(createAdminClient).mockReturnValue(buildMock(project, 0, latestPbdbFile) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.error).toBe("Please review and acknowledge the flagged issues before sending.");
    expect(scheduleOrDeliverPbdb).not.toHaveBeenCalled();
  });

  it("dispatches once flags are acknowledged even though findings are present", async () => {
    const project = { status: "in_progress", qa_completed_by: "consultant-1", assigned_consultant_id: "consultant-1", review_cycle: 1 };
    const latestPbdbFile = { filename_mismatch_reason: "mismatch", structure_scan_findings: null, qa_flags_acknowledged_at: "2026-08-05T00:00:00Z" };
    vi.mocked(createAdminClient).mockReturnValue(buildMock(project, 0, latestPbdbFile) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.success).toBe(true);
    expect(scheduleOrDeliverPbdb).toHaveBeenCalled();
  });

  it("dispatches when the latest PBDB has no findings at all", async () => {
    const project = { status: "in_progress", qa_completed_by: "consultant-1", assigned_consultant_id: "consultant-1", review_cycle: 1 };
    const latestPbdbFile = { filename_mismatch_reason: null, structure_scan_findings: null, qa_flags_acknowledged_at: null };
    vi.mocked(createAdminClient).mockReturnValue(buildMock(project, 0, latestPbdbFile) as never);

    const result = await dispatchToStakeholders(PROJECT_ID, {}, new FormData());

    expect(result.success).toBe(true);
    expect(scheduleOrDeliverPbdb).toHaveBeenCalled();
  });
});
