import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/log");
vi.mock("@/lib/documents/revision-history");

import { recalculateClosedRound } from "./review-round";
import { recordRevisionEvent } from "@/lib/documents/revision-history";

type Row = Record<string, unknown>;

// In-memory query builder covering select/update/delete with eq/gt/limit —
// enough to run the round recalculation against real row state.
function fakeDb(tables: Record<string, Row[]>) {
  function from(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let mode: "select" | "update" | "delete" = "select";
    let patch: Row = {};
    let limit = Infinity;
    const run = () => {
      const rows = (tables[table] ??= []).filter((r) => filters.every((f) => f(r)));
      if (mode === "update") {
        for (const r of rows) Object.assign(r, patch);
        return { data: null, error: null, count: rows.length };
      }
      if (mode === "delete") {
        tables[table] = tables[table].filter((r) => !rows.includes(r));
        return { data: null, error: null, count: rows.length };
      }
      return { data: rows.slice(0, limit).map((r) => ({ ...r })), error: null };
    };
    const b: Record<string, unknown> = {
      select: () => b,
      update: (v: Row) => ((mode = "update"), (patch = v), b),
      delete: () => ((mode = "delete"), b),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
      gt: (k: string, v: number) => (filters.push((r) => (r[k] as number) > v), b),
      limit: (n: number) => ((limit = n), b),
      maybeSingle: () => Promise.resolve({ data: (run().data as Row[])[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(run()).then(resolve),
    };
    return b;
  }
  return { from } as never;
}

function setup(reviews: [string, string][], revisions: Row[]) {
  const tables: Record<string, Row[]> = {
    stakeholder_reviews: reviews.map(([status, round_status], i) => ({ id: `r${i}`, project_id: "p1", review_cycle: 1, status, round_status })),
    revision_history: revisions,
  };
  vi.mocked(recordRevisionEvent).mockImplementation(async () => {
    tables.revision_history.push({ id: `rev${tables.revision_history.length}`, project_id: "p1", doc_type: "pbdb", event: "rejected", review_cycle: 1, rev_number: tables.revision_history.length });
    return tables.revision_history.length - 1;
  });
  return { tables, db: fakeDb(tables) };
}

const BUMP = { id: "b1", project_id: "p1", doc_type: "pbdb", event: "rejected", review_cycle: 1, rev_number: 1 };
const INITIAL = { id: "i0", project_id: "p1", doc_type: "pbdb", event: "initial", review_cycle: null, rev_number: 0 };

beforeEach(() => vi.clearAllMocks());

describe("recalculateClosedRound (#209)", () => {
  it("rejected → approved: reopens as closed_approved and reverses the revision bump", async () => {
    const { tables, db } = setup([["approved_without_comments", "closed_rejected"], ["approved_without_comments", "closed_rejected"]], [INITIAL, BUMP]);
    const result = await recalculateClosedRound(db, "p1", 1);
    expect(result).toEqual({ changed: "closed_approved", revisionBumped: false, revisionReversed: true });
    expect(tables.stakeholder_reviews.every((r) => r.round_status === "closed_approved")).toBe(true);
    expect(tables.revision_history.map((r) => r.id)).toEqual(["i0"]);
  });

  it("approved → rejected: closes as rejected and bumps the revision once", async () => {
    const { tables, db } = setup([["rejected_with_comments", "closed_approved"], ["approved_without_comments", "closed_approved"]], [INITIAL]);
    const result = await recalculateClosedRound(db, "p1", 1);
    expect(result).toEqual({ changed: "closed_rejected", revisionBumped: true, revisionReversed: false });
    expect(tables.stakeholder_reviews.every((r) => r.round_status === "closed_rejected")).toBe(true);
    expect(recordRevisionEvent).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the outcome is unchanged (another rejection still stands, or a non-flip edit)", async () => {
    const { tables, db } = setup([["rejected_with_comments", "closed_rejected"], ["rejected_with_comments", "closed_rejected"]], [INITIAL, BUMP]);
    expect(await recalculateClosedRound(db, "p1", 1)).toEqual({ changed: null, revisionBumped: false, revisionReversed: false });
    expect(tables.revision_history).toHaveLength(2);
  });

  it("ignores superseded rows when re-deriving the outcome", async () => {
    const { db } = setup([["approved_without_comments", "closed_rejected"], ["superseded", "superseded"]], [INITIAL, BUMP]);
    expect((await recalculateClosedRound(db, "p1", 1)).changed).toBe("closed_approved");
  });

  it("does not reverse a bump that a newer revision was built on", async () => {
    const newer = { id: "n2", project_id: "p1", doc_type: "pbdb", event: "reverted", review_cycle: null, rev_number: 2 };
    const { tables, db } = setup([["approved_without_comments", "closed_rejected"]], [INITIAL, BUMP, newer]);
    const result = await recalculateClosedRound(db, "p1", 1);
    expect(result.revisionReversed).toBe(false);
    expect(tables.revision_history).toHaveLength(3);
  });

  it("concurrent corrections apply the reversal exactly once", async () => {
    const { tables, db } = setup([["approved_without_comments", "closed_rejected"], ["approved_without_comments", "closed_rejected"]], [INITIAL, BUMP]);
    const results = await Promise.all([recalculateClosedRound(db, "p1", 1), recalculateClosedRound(db, "p1", 1)]);
    expect(results.filter((r) => r.revisionReversed)).toHaveLength(1);
    expect(tables.revision_history.map((r) => r.id)).toEqual(["i0"]);
  });

  it("concurrent corrections apply the bump exactly once", async () => {
    const { db } = setup([["rejected_with_comments", "closed_approved"]], [INITIAL]);
    await Promise.all([recalculateClosedRound(db, "p1", 1), recalculateClosedRound(db, "p1", 1)]);
    expect(recordRevisionEvent).toHaveBeenCalledTimes(1);
  });

  it("is a no-op on an open round", async () => {
    const { db } = setup([["rejected_with_comments", "open"], ["pending", "open"]], [INITIAL]);
    expect((await recalculateClosedRound(db, "p1", 1)).changed).toBeNull();
  });
});
