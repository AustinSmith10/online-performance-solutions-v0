import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/log");
vi.mock("@/lib/documents/revision-history");

import {
  closeRoundIfComplete,
  deriveRoundStatus,
  forceCloseRound,
  forcedCloseWouldBump,
} from "./review-round";
import { auditLog } from "@/lib/audit/log";
import { recordRevisionEvent } from "@/lib/documents/revision-history";

type Row = Record<string, unknown>;

// Minimal in-memory stand-in for the supabase query builder — just the
// select/update/eq/limit surface review-round.ts uses, so the round logic is
// exercised against real row state rather than call-order mocks.
function fakeDb(tables: Record<string, Row[]>) {
  function from(table: string) {
    const filters: [string, unknown][] = [];
    let mode: "select" | "update" = "select";
    let patch: Row = {};
    let limit = Infinity;
    const matches = () =>
      (tables[table] ??= []).filter((r) => filters.every(([k, v]) => r[k] === v));
    const builder = {
      select: () => builder,
      update: (values: Row) => {
        mode = "update";
        patch = values;
        return builder;
      },
      eq: (k: string, v: unknown) => {
        filters.push([k, v]);
        return builder;
      },
      limit: (n: number) => {
        limit = n;
        return builder;
      },
      then: (resolve: (v: unknown) => unknown) => {
        const rows = matches();
        if (mode === "update") {
          for (const r of rows) Object.assign(r, patch);
          return Promise.resolve({ data: null, error: null, count: rows.length }).then(resolve);
        }
        return Promise.resolve({ data: rows.slice(0, limit).map((r) => ({ ...r })), error: null }).then(resolve);
      },
    };
    return builder;
  }
  return { from } as never;
}

function review(status: string, name = status, round_status = "open"): Row {
  return {
    project_id: "p1",
    review_cycle: 1,
    status,
    round_status,
    stakeholder_name: name,
    stakeholder_email: `${name}@example.com`,
  };
}

let tables: Record<string, Row[]>;

beforeEach(() => {
  vi.clearAllMocks();
  tables = { stakeholder_reviews: [], revision_history: [] };
  vi.mocked(recordRevisionEvent).mockImplementation(async (_db, projectId, docType, event, cycle) => {
    tables.revision_history.push({ project_id: projectId, doc_type: docType, event, review_cycle: cycle });
    return tables.revision_history.length;
  });
});

describe("closeRoundIfComplete — natural close", () => {
  it("closes approved with no revision bump once every review is approved", async () => {
    tables.stakeholder_reviews = [review("approved_without_comments", "a"), review("approved_with_comments", "b")];
    const result = await closeRoundIfComplete(fakeDb(tables), "p1", 1);
    expect(result).toEqual({ closed: "closed_approved", revisionBumped: false });
    expect(tables.stakeholder_reviews.every((r) => r.round_status === "closed_approved")).toBe(true);
    expect(recordRevisionEvent).not.toHaveBeenCalled();
  });

  it("stays open (no bump) while anyone is still pending, even after a rejection", async () => {
    tables.stakeholder_reviews = [review("rejected_with_comments", "a"), review("pending", "b")];
    const result = await closeRoundIfComplete(fakeDb(tables), "p1", 1);
    expect(result).toEqual({ closed: null, revisionBumped: false });
    expect(tables.stakeholder_reviews.every((r) => r.round_status === "open")).toBe(true);
    expect(recordRevisionEvent).not.toHaveBeenCalled();
  });

  it("closes rejected and bumps the revision number exactly once when the last review lands", async () => {
    tables.stakeholder_reviews = [
      review("rejected_with_comments", "a"),
      review("rejected_with_comments", "b"),
      review("waived", "c"),
    ];
    const db = fakeDb(tables);
    const first = await closeRoundIfComplete(db, "p1", 1);
    const second = await closeRoundIfComplete(db, "p1", 1);
    expect(first).toEqual({ closed: "closed_rejected", revisionBumped: true });
    expect(second).toEqual({ closed: null, revisionBumped: false });
    expect(recordRevisionEvent).toHaveBeenCalledTimes(1);
    expect(recordRevisionEvent).toHaveBeenCalledWith(db, "p1", "pbdb", "rejected", 1);
  });

  it("does not bump again when the round's bump was already recorded (legacy first-rejection bump)", async () => {
    tables.stakeholder_reviews = [review("rejected_with_comments", "a")];
    tables.revision_history = [{ project_id: "p1", doc_type: "pbdb", event: "rejected", review_cycle: 1 }];
    const result = await closeRoundIfComplete(fakeDb(tables), "p1", 1);
    expect(result).toEqual({ closed: "closed_rejected", revisionBumped: false });
    expect(recordRevisionEvent).not.toHaveBeenCalled();
  });

  it("never bumps across two fully-approved rounds", async () => {
    tables.stakeholder_reviews = [
      review("approved_without_comments", "a"),
      { ...review("approved_without_comments", "a"), review_cycle: 2 },
    ];
    const db = fakeDb(tables);
    await closeRoundIfComplete(db, "p1", 1);
    await closeRoundIfComplete(db, "p1", 2);
    expect(recordRevisionEvent).not.toHaveBeenCalled();
  });
});

describe("forceCloseRound — revised PBDB uploaded mid-round", () => {
  const actor = { id: "c1", email: "consultant@example.com" };

  it("bumps when a rejection was already recorded, and supersedes the still-pending reviews", async () => {
    tables.stakeholder_reviews = [review("rejected_with_comments", "a"), review("pending", "b")];
    const db = fakeDb(tables);
    expect(await forcedCloseWouldBump(db, "p1", 1)).toBe(true);

    const result = await forceCloseRound(db, "p1", 1, actor);
    expect(result).toEqual({
      closed: true,
      revisionBumped: true,
      supersededStakeholders: [{ name: "b", email: "b@example.com" }],
    });
    expect(tables.stakeholder_reviews[0]).toMatchObject({ status: "rejected_with_comments", round_status: "closed_rejected" });
    expect(tables.stakeholder_reviews[1]).toMatchObject({ status: "superseded", round_status: "superseded" });
    expect(recordRevisionEvent).toHaveBeenCalledWith(db, "p1", "pbdb", "rejected", 1);
    expect(auditLog).toHaveBeenCalledWith(
      "project.round_force_closed",
      "c1",
      "consultant@example.com",
      expect.objectContaining({
        projectId: "p1",
        metadata: expect.objectContaining({ still_pending: [{ name: "b", email: "b@example.com" }] }),
      })
    );
  });

  it("does not bump for a pre-emptive correction with no prior rejection", async () => {
    tables.stakeholder_reviews = [review("approved_without_comments", "a"), review("pending", "b")];
    const db = fakeDb(tables);
    expect(await forcedCloseWouldBump(db, "p1", 1)).toBe(false);

    const result = await forceCloseRound(db, "p1", 1, actor);
    expect(result.closed).toBe(true);
    expect(result.revisionBumped).toBe(false);
    expect(recordRevisionEvent).not.toHaveBeenCalled();
    expect(tables.stakeholder_reviews.every((r) => r.round_status === "superseded")).toBe(true);
  });

  it("is a no-op on a round that already closed naturally", async () => {
    tables.stakeholder_reviews = [review("rejected_with_comments", "a", "closed_rejected")];
    const db = fakeDb(tables);
    expect(await forcedCloseWouldBump(db, "p1", 1)).toBe(false);
    const result = await forceCloseRound(db, "p1", 1, actor);
    expect(result).toEqual({ closed: false, revisionBumped: false, supersededStakeholders: [] });
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("leaves superseded reviews out of anything counting pending", async () => {
    tables.stakeholder_reviews = [review("pending", "a"), review("pending", "b")];
    const db = fakeDb(tables);
    await forceCloseRound(db, "p1", 1, actor);
    // Pending counts everywhere are `.eq("status", "pending")` queries.
    expect(tables.stakeholder_reviews.filter((r) => r.status === "pending")).toHaveLength(0);
  });
});

describe("deriveRoundStatus", () => {
  it("reads a forced close's mixed rows as closed_rejected", () => {
    expect(deriveRoundStatus([{ round_status: "superseded" }, { round_status: "closed_rejected" }])).toBe("closed_rejected");
    expect(deriveRoundStatus([{ round_status: "superseded" }])).toBe("superseded");
    expect(deriveRoundStatus([])).toBeNull();
  });
});
