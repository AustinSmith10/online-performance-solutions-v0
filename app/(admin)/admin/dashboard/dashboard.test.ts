import { describe, it, expect } from "vitest";
import type { ProjectStatus } from "@/types";

// ── Mirror the filtering logic from page.tsx ──────────────────────────────────
// These pure functions are inlined in the server component.
// Testing them here ensures the derivation rules are correct.

type Row = {
  id: string;
  status: ProjectStatus;
  expected_delivery_date: string | null;
  payment_override: boolean;
  assigned_consultant_id: string | null;
  review_buffer_fired_at: string | null;
};

function deriveUnassigned(rows: Row[]) {
  return rows.filter((p) => p.status === "submitted" && !p.assigned_consultant_id);
}

function deriveOverdue(rows: Row[], todayIso: string) {
  return rows.filter(
    (p) => p.expected_delivery_date && p.expected_delivery_date < todayIso
  );
}

function deriveOverridePending(rows: Row[]) {
  return rows.filter((p) => p.payment_override);
}

function deriveAwaitingStakeholder(rows: Row[], pendingProjectIds: Set<string>) {
  return rows.filter(
    (p) =>
      p.status === "dispatched" &&
      p.review_buffer_fired_at !== null &&
      pendingProjectIds.has(p.id)
  );
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function row(overrides: Partial<Row> & { id: string; status: ProjectStatus }): Row {
  return {
    expected_delivery_date: null,
    payment_override: false,
    assigned_consultant_id: "consultant-1",
    review_buffer_fired_at: null,
    ...overrides,
  };
}

const TODAY = "2026-06-19";
const YESTERDAY = "2026-06-18";
const TOMORROW = "2026-06-20";

// ── Unassigned ────────────────────────────────────────────────────────────────

describe("deriveUnassigned", () => {
  it("includes submitted projects with no consultant", () => {
    const rows = [row({ id: "a", status: "submitted", assigned_consultant_id: null })];
    expect(deriveUnassigned(rows)).toHaveLength(1);
  });

  it("excludes submitted projects that have a consultant", () => {
    const rows = [row({ id: "a", status: "submitted", assigned_consultant_id: "c1" })];
    expect(deriveUnassigned(rows)).toHaveLength(0);
  });

  it("excludes non-submitted projects with no consultant", () => {
    const rows = [row({ id: "a", status: "in_progress", assigned_consultant_id: null })];
    expect(deriveUnassigned(rows)).toHaveLength(0);
  });

  it("returns only the unassigned subset from a mixed list", () => {
    const rows = [
      row({ id: "a", status: "submitted", assigned_consultant_id: null }),
      row({ id: "b", status: "submitted", assigned_consultant_id: "c1" }),
      row({ id: "c", status: "in_progress", assigned_consultant_id: null }),
      row({ id: "d", status: "assigned", assigned_consultant_id: null }),
    ];
    const result = deriveUnassigned(rows);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });
});

// ── Overdue ───────────────────────────────────────────────────────────────────

describe("deriveOverdue", () => {
  it("flags projects whose expected_delivery_date is in the past", () => {
    const rows = [row({ id: "a", status: "in_progress", expected_delivery_date: YESTERDAY })];
    expect(deriveOverdue(rows, TODAY)).toHaveLength(1);
  });

  it("excludes projects due today (not yet overdue)", () => {
    const rows = [row({ id: "a", status: "in_progress", expected_delivery_date: TODAY })];
    expect(deriveOverdue(rows, TODAY)).toHaveLength(0);
  });

  it("excludes projects due in the future", () => {
    const rows = [row({ id: "a", status: "in_progress", expected_delivery_date: TOMORROW })];
    expect(deriveOverdue(rows, TODAY)).toHaveLength(0);
  });

  it("excludes projects with no delivery date", () => {
    const rows = [row({ id: "a", status: "in_progress", expected_delivery_date: null })];
    expect(deriveOverdue(rows, TODAY)).toHaveLength(0);
  });

  it("returns multiple overdue projects", () => {
    const rows = [
      row({ id: "a", status: "in_progress", expected_delivery_date: "2026-06-01" }),
      row({ id: "b", status: "dispatched",   expected_delivery_date: "2026-06-10" }),
      row({ id: "c", status: "assigned",      expected_delivery_date: TOMORROW }),
    ];
    const result = deriveOverdue(rows, TODAY);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

// ── Override pending ──────────────────────────────────────────────────────────

describe("deriveOverridePending", () => {
  it("includes projects with payment_override=true", () => {
    const rows = [row({ id: "a", status: "assigned", payment_override: true })];
    expect(deriveOverridePending(rows)).toHaveLength(1);
  });

  it("excludes projects with payment_override=false", () => {
    const rows = [row({ id: "a", status: "assigned", payment_override: false })];
    expect(deriveOverridePending(rows)).toHaveLength(0);
  });

  it("works regardless of project status", () => {
    const rows = [
      row({ id: "a", status: "dispatched",  payment_override: true }),
      row({ id: "b", status: "in_progress", payment_override: true }),
      row({ id: "c", status: "submitted",   payment_override: false }),
    ];
    const result = deriveOverridePending(rows);
    expect(result).toHaveLength(2);
  });
});

// ── Awaiting stakeholder ──────────────────────────────────────────────────────

describe("deriveAwaitingStakeholder", () => {
  it("includes dispatched projects with buffer fired and a pending review", () => {
    const rows = [
      row({ id: "a", status: "dispatched", review_buffer_fired_at: "2026-06-17T09:00:00Z" }),
    ];
    const pending = new Set(["a"]);
    expect(deriveAwaitingStakeholder(rows, pending)).toHaveLength(1);
  });

  it("excludes dispatched projects where buffer has not fired", () => {
    const rows = [row({ id: "a", status: "dispatched", review_buffer_fired_at: null })];
    expect(deriveAwaitingStakeholder(rows, new Set(["a"]))).toHaveLength(0);
  });

  it("excludes dispatched+buffer-fired projects with no pending review", () => {
    const rows = [
      row({ id: "a", status: "dispatched", review_buffer_fired_at: "2026-06-17T09:00:00Z" }),
    ];
    expect(deriveAwaitingStakeholder(rows, new Set())).toHaveLength(0);
  });

  it("excludes non-dispatched projects even if they have pending reviews", () => {
    const rows = [row({ id: "a", status: "in_progress", review_buffer_fired_at: "2026-06-17T09:00:00Z" })];
    expect(deriveAwaitingStakeholder(rows, new Set(["a"]))).toHaveLength(0);
  });

  it("returns only projects satisfying all three conditions from a mixed list", () => {
    const rows = [
      row({ id: "match",           status: "dispatched",  review_buffer_fired_at: "2026-06-17T09:00:00Z" }),
      row({ id: "no-buffer",       status: "dispatched",  review_buffer_fired_at: null }),
      row({ id: "no-pending",      status: "dispatched",  review_buffer_fired_at: "2026-06-17T09:00:00Z" }),
      row({ id: "wrong-status",    status: "in_progress", review_buffer_fired_at: "2026-06-17T09:00:00Z" }),
    ];
    const pending = new Set(["match", "no-buffer", "wrong-status"]); // "no-pending" deliberately absent
    const result = deriveAwaitingStakeholder(rows, pending);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("match");
  });
});
