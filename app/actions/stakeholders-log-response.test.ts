import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/documents/pending-delivery");
vi.mock("@/lib/stakeholders/review-outcome");
vi.mock("@/lib/stakeholders/review-round");

import { logStakeholderResponseOnBehalf } from "./stakeholders";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { notifyModificationsRequested, resolveProjectRef } from "@/lib/stakeholders/review-outcome";
import { closeRoundIfComplete, getRoundStatus } from "@/lib/stakeholders/review-round";

type Row = Record<string, unknown>;

// In-memory stand-in for the query-builder surface this action uses, so the
// re-derived project status is checked against real row state.
function fakeDb(tables: Record<string, Row[]>) {
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "update" = "select";
    let patch: Row = {};
    const rows = () => (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      const matched = rows();
      if (mode === "update") {
        for (const r of matched) Object.assign(r, patch);
        return { data: null, error: null, count: matched.length };
      }
      return { data: matched.map((r) => ({ ...r })), error: null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      update: (values: Row) => {
        mode = "update";
        patch = values;
        return builder;
      },
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), builder),
      is: (k: string, v: unknown) => (filters.push((r) => (r[k] ?? null) === v), builder),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), builder),
      maybeSingle: () => Promise.resolve({ data: (run().data as Row[])[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: (run().data as Row[])[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return builder;
  }
  return { from } as never;
}

const CONSULTANT = { id: "c1", role: "consultant", email: "c@ddeg.com.au" };

function setup(reviews: Row[], projectStatus: string) {
  const tables: Record<string, Row[]> = {
    projects: [
      {
        id: "p1",
        client_id: "org1",
        assigned_consultant_id: "c1",
        status: projectStatus,
        review_cycle: 1,
        deleted_at: null,
        first_response_at: "2026-09-01T00:00:00Z",
      },
    ],
    stakeholder_reviews: reviews.map((r) => ({ project_id: "p1", review_cycle: 1, round_status: "open", ...r })),
  };
  vi.mocked(createAdminClient).mockReturnValue(fakeDb(tables));
  return tables;
}

function log(reviewId: string, response: "approved" | "rejected", replace: { previousStatus: string } | null) {
  return logStakeholderResponseOnBehalf(
    reviewId,
    "p1",
    response,
    response === "rejected" ? "Fix page 3." : null,
    null,
    "call",
    "Jane",
    "2026-09-20T10:00:00Z",
    replace
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue(CONSULTANT as never);
  vi.mocked(resolveProjectRef).mockReturnValue("OPS-1");
  vi.mocked(getRoundStatus).mockResolvedValue("open");
  vi.mocked(closeRoundIfComplete).mockResolvedValue({ closed: null, revisionBumped: false });
});

describe("logStakeholderResponseOnBehalf — replacing a logged response (#192)", () => {
  it("refuses to overwrite an existing response without an explicit replace confirmation", async () => {
    setup([{ id: "r1", status: "approved_without_comments", stakeholder_name: "Jane", stakeholder_email: "j@x.com" }], "dispatched");
    const result = await log("r1", "rejected", null);
    expect(result.error).toMatch(/already been responded to/);
  });

  it("refuses when the confirmed previous value no longer matches what's recorded", async () => {
    setup([{ id: "r1", status: "rejected_with_comments", stakeholder_name: "Jane", stakeholder_email: "j@x.com" }], "revision_required");
    const result = await log("r1", "approved", { previousStatus: "approved_without_comments" });
    expect(result.error).toMatch(/changed since you opened it/);
  });

  it("refuses once the round has closed", async () => {
    setup([{ id: "r1", status: "approved_without_comments", stakeholder_name: "Jane", stakeholder_email: "j@x.com" }], "dispatched");
    vi.mocked(getRoundStatus).mockResolvedValue("closed_approved");
    const result = await log("r1", "rejected", { previousStatus: "approved_without_comments" });
    expect(result.error).toMatch(/round has closed/);
  });

  it("replacing the round's only rejection with an approval returns the project to dispatched", async () => {
    const tables = setup(
      [
        { id: "r1", status: "rejected_with_comments", comments: "Wrong lot", stakeholder_name: "Jane", stakeholder_email: "j@x.com", response_mode: "email", respondent_name: "Jane" },
        { id: "r2", status: "pending", stakeholder_name: "Bob", stakeholder_email: "b@x.com" },
      ],
      "revision_required"
    );
    const result = await log("r1", "approved", { previousStatus: "rejected_with_comments" });
    expect(result).toEqual({ success: true });
    expect(tables.stakeholder_reviews[0].status).toBe("approved_without_comments");
    expect(tables.projects[0].status).toBe("dispatched");
    expect(closeRoundIfComplete).toHaveBeenCalledWith(expect.anything(), "p1", 1);
    expect(auditLog).toHaveBeenCalledWith(
      "stakeholder.response_replaced",
      "c1",
      "c@ddeg.com.au",
      expect.objectContaining({
        metadata: expect.objectContaining({
          old: expect.objectContaining({ status: "rejected_with_comments", comments: "Wrong lot", response_mode: "email", respondent_name: "Jane" }),
          new: expect.objectContaining({ status: "approved_without_comments", response_mode: "call", respondent_name: "Jane" }),
        }),
      })
    );
    expect(auditLog).not.toHaveBeenCalledWith("stakeholder.responded_on_behalf", expect.anything(), expect.anything(), expect.anything());
  });

  it("keeps revision_required when another rejection still stands", async () => {
    const tables = setup(
      [
        { id: "r1", status: "rejected_with_comments", stakeholder_name: "Jane", stakeholder_email: "j@x.com" },
        { id: "r2", status: "rejected_with_comments", stakeholder_name: "Bob", stakeholder_email: "b@x.com" },
        { id: "r3", status: "pending", stakeholder_name: "Al", stakeholder_email: "a@x.com" },
      ],
      "revision_required"
    );
    await log("r1", "approved", { previousStatus: "rejected_with_comments" });
    expect(tables.projects[0].status).toBe("revision_required");
  });

  it("replacing an approval (e.g. a stakeholder's own portal response) with a rejection sends the project to revision_required", async () => {
    const tables = setup(
      [
        { id: "r1", status: "approved_with_comments", comments: "ok", stakeholder_name: "Jane", stakeholder_email: "j@x.com", response_mode: null },
        { id: "r2", status: "pending", stakeholder_name: "Bob", stakeholder_email: "b@x.com" },
      ],
      "dispatched"
    );
    const result = await log("r1", "rejected", { previousStatus: "approved_with_comments" });
    expect(result).toEqual({ success: true });
    expect(tables.projects[0].status).toBe("revision_required");
    expect(notifyModificationsRequested).toHaveBeenCalled();
  });

  it("a first-time log on a pending review still works without a replace confirmation", async () => {
    const tables = setup([{ id: "r1", status: "pending", stakeholder_name: "Jane", stakeholder_email: "j@x.com" }], "dispatched");
    const result = await log("r1", "approved", null);
    expect(result).toEqual({ success: true });
    expect(tables.stakeholder_reviews[0].status).toBe("approved_without_comments");
    expect(auditLog).toHaveBeenCalledWith("stakeholder.responded_on_behalf", "c1", "c@ddeg.com.au", expect.anything());
  });
});
