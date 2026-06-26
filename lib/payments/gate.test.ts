import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");

import { checkDispatchGate, checkPbdrGate } from "./gate";
import { createAdminClient } from "@/lib/supabase/admin";

type MockClient = ReturnType<typeof createAdminClient>;

function chain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error });
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.is = self;
  obj.single = resolve;
  obj.maybeSingle = resolve;
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  return obj;
}

// ─── checkDispatchGate ────────────────────────────────────────────────────────

function buildDispatchMock(
  orgData: Record<string, unknown> | null,
  error: unknown = null
): MockClient {
  return { from: vi.fn(() => chain(orgData, error)) } as unknown as MockClient;
}

describe("checkDispatchGate", () => {
  beforeEach(() => vi.mocked(createAdminClient).mockReset());

  it("returns allowed=false when org is not found (error)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildDispatchMock(null, { message: "not found" })
    );
    const result = await checkDispatchGate("org-1", "proj-1");
    expect(result.allowed).toBe(false);
  });

  it("returns allowed=false when org row is null with no error", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildDispatchMock(null));
    const result = await checkDispatchGate("org-1", "proj-1");
    expect(result.allowed).toBe(false);
  });

  describe("upfront payment method", () => {
    it("always allows regardless of balance", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "upfront",
          credit_balance: 0,
          credit_limit: 0,
          deferred_balance: 0,
          is_frozen: false,
        })
      );
      expect((await checkDispatchGate("org-1", "proj-1")).allowed).toBe(true);
    });

    it("allows even when balance is negative (no check applied)", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "upfront",
          credit_balance: -999,
          credit_limit: 0,
          deferred_balance: 0,
          is_frozen: true,
        })
      );
      expect((await checkDispatchGate("org-1", "proj-1")).allowed).toBe(true);
    });
  });

  describe("deferred payment method", () => {
    it("blocks and returns reason when org is frozen", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "deferred",
          credit_balance: 0,
          credit_limit: 10,
          deferred_balance: 2,
          is_frozen: true,
        })
      );
      const result = await checkDispatchGate("org-1", "proj-1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/frozen/i);
    });

    it("blocks when deferred balance equals the limit", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "deferred",
          credit_balance: 0,
          credit_limit: 5,
          deferred_balance: 5,
          is_frozen: false,
        })
      );
      const result = await checkDispatchGate("org-1", "proj-1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/limit/i);
    });

    it("blocks when deferred balance exceeds the limit", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "deferred",
          credit_balance: 0,
          credit_limit: 5,
          deferred_balance: 7,
          is_frozen: false,
        })
      );
      expect((await checkDispatchGate("org-1", "proj-1")).allowed).toBe(false);
    });

    it("allows when unfrozen and deferred balance is below the limit", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "deferred",
          credit_balance: 0,
          credit_limit: 10,
          deferred_balance: 3,
          is_frozen: false,
        })
      );
      expect((await checkDispatchGate("org-1", "proj-1")).allowed).toBe(true);
    });

    it("allows when limit is 0 (no limit configured)", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "deferred",
          credit_balance: 0,
          credit_limit: 0,
          deferred_balance: 999,
          is_frozen: false,
        })
      );
      expect((await checkDispatchGate("org-1", "proj-1")).allowed).toBe(true);
    });
  });

  describe("credit_deduction payment method", () => {
    it("blocks with reason when credit balance is 0", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "credit_deduction",
          credit_balance: 0,
          credit_limit: 0,
          deferred_balance: 0,
          is_frozen: false,
        })
      );
      const result = await checkDispatchGate("org-1", "proj-1");
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/insufficient/i);
    });

    it("blocks when credit balance is negative", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "credit_deduction",
          credit_balance: -1,
          credit_limit: 0,
          deferred_balance: 0,
          is_frozen: false,
        })
      );
      expect((await checkDispatchGate("org-1", "proj-1")).allowed).toBe(false);
    });

    it("allows when credit balance is exactly 1", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "credit_deduction",
          credit_balance: 1,
          credit_limit: 0,
          deferred_balance: 0,
          is_frozen: false,
        })
      );
      expect((await checkDispatchGate("org-1", "proj-1")).allowed).toBe(true);
    });

    it("allows when credit balance is greater than 1", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        buildDispatchMock({
          payment_method: "credit_deduction",
          credit_balance: 50,
          credit_limit: 0,
          deferred_balance: 0,
          is_frozen: false,
        })
      );
      expect((await checkDispatchGate("org-1", "proj-1")).allowed).toBe(true);
    });
  });
});

// ─── checkPbdrGate ────────────────────────────────────────────────────────────

type ProjectRow = { credit_deducted: boolean; payment_override: boolean; review_cycle: number };

function buildPbdrMock({
  project = { credit_deducted: true, payment_override: false, review_cycle: 1 } as ProjectRow | null,
  projectError = null as unknown,
  pendingReviews = [] as { id: string }[],
} = {}): MockClient {
  const calls: Record<string, number> = {};
  return {
    from: vi.fn((table: string) => {
      calls[table] = (calls[table] ?? 0) + 1;
      if (table === "projects") return chain(project, projectError);
      if (table === "stakeholder_reviews") return chain(pendingReviews);
      return chain(null);
    }),
  } as unknown as MockClient;
}

describe("checkPbdrGate", () => {
  beforeEach(() => vi.mocked(createAdminClient).mockReset());

  it("returns allowed=false and creditDeducted=false when project not found", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildPbdrMock({ project: null, projectError: { message: "not found" } })
    );
    const result = await checkPbdrGate("proj-1");
    expect(result.allowed).toBe(false);
    expect(result.creditDeducted).toBe(false);
  });

  it("blocks when credit_deducted is false and no payment_override", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildPbdrMock({
        project: { credit_deducted: false, payment_override: false, review_cycle: 1 },
        pendingReviews: [],
      })
    );
    expect((await checkPbdrGate("proj-1")).allowed).toBe(false);
  });

  it("allows when credit_deducted is true and no pending reviews", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildPbdrMock({
        project: { credit_deducted: true, payment_override: false, review_cycle: 1 },
        pendingReviews: [],
      })
    );
    const result = await checkPbdrGate("proj-1");
    expect(result.allowed).toBe(true);
    expect(result.creditDeducted).toBe(true);
  });

  it("blocks when credit_deducted is true but there are pending stakeholder reviews", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildPbdrMock({
        project: { credit_deducted: true, payment_override: false, review_cycle: 1 },
        pendingReviews: [{ id: "review-1" }, { id: "review-2" }],
      })
    );
    const result = await checkPbdrGate("proj-1");
    expect(result.allowed).toBe(false);
    expect(result.creditDeducted).toBe(true);
  });

  it("treats payment_override=true as credit_deducted for gate purposes", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildPbdrMock({
        project: { credit_deducted: false, payment_override: true, review_cycle: 1 },
        pendingReviews: [],
      })
    );
    const result = await checkPbdrGate("proj-1");
    expect(result.allowed).toBe(true);
    expect(result.creditDeducted).toBe(true);
  });

  it("blocks when payment_override=true but there are still pending reviews", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildPbdrMock({
        project: { credit_deducted: false, payment_override: true, review_cycle: 1 },
        pendingReviews: [{ id: "review-1" }],
      })
    );
    expect((await checkPbdrGate("proj-1")).allowed).toBe(false);
  });

  it("uses the project's review_cycle when querying pending reviews", async () => {
    const fromFn = vi.fn((table: string) => {
      if (table === "projects")
        return chain({ credit_deducted: true, payment_override: false, review_cycle: 3 });
      return chain([]); // no pending reviews
    });
    vi.mocked(createAdminClient).mockReturnValue({ from: fromFn } as unknown as MockClient);
    await checkPbdrGate("proj-1");
    // The stakeholder_reviews call should have been made (i.e. from was called with it)
    const tableNames = fromFn.mock.calls.map(([t]) => t as string);
    expect(tableNames).toContain("stakeholder_reviews");
  });

  it("allows when both credit_deducted and payment_override are true and no pending reviews", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildPbdrMock({
        project: { credit_deducted: true, payment_override: true, review_cycle: 1 },
        pendingReviews: [],
      })
    );
    expect((await checkPbdrGate("proj-1")).allowed).toBe(true);
  });
});
