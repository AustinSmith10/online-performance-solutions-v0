import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/notifications/notify");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/email/templates/CreditDeductionEmail", () => ({
  renderCreditDeductionEmail: vi.fn().mockReturnValue("<html>deduction</html>"),
}));
vi.mock("@/lib/email/templates/LowCreditEmail", () => ({
  renderLowCreditEmail: vi.fn().mockReturnValue("<html>low-credit</html>"),
}));

import { topUpCredit, deductCredit, debitDeferred, logUpfront, logOverride } from "./ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { notify } from "@/lib/notifications/notify";
import { auditLog } from "@/lib/audit/log";

const ORG_ID = "org-1";
const PROJECT_ID = "proj-1";
const ACTOR_ID = "actor-1";

/** Thenable chain that always resolves to { data, error }. */
function chain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error });
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.in = self;
  obj.single = resolve;
  obj.maybeSingle = resolve;
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  return obj;
}

/**
 * Builds a mock admin client. `rpcResult` is what `.rpc(...).single()`
 * resolves to. `fromHandlers` lets a test override specific table behavior
 * (e.g. a "clients"/"projects" lookup, or asserting on an insert call);
 * anything not covered falls back to an empty chain.
 */
function buildMock(
  rpcResult: { data: unknown; error: unknown },
  fromHandlers: Record<string, () => unknown> = {}
) {
  const rpcFn = vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue(rpcResult) });
  const insertCalls: { table: string; payload: unknown }[] = [];
  const fromFn = vi.fn((table: string) => {
    if (fromHandlers[table]) return fromHandlers[table]();
    return {
      ...chain([]),
      insert: (payload: unknown) => {
        insertCalls.push({ table, payload });
        return Promise.resolve({ data: null, error: null });
      },
    };
  });
  return { rpc: rpcFn, from: fromFn, insertCalls };
}

beforeEach(() => {
  vi.mocked(createAdminClient).mockReset();
  vi.mocked(notify).mockReset().mockResolvedValue(undefined);
  vi.mocked(auditLog).mockReset().mockResolvedValue(undefined);
});

// ─── topUpCredit ────────────────────────────────────────────────────────────

describe("topUpCredit", () => {
  it("rejects amounts below 1 without calling the RPC", async () => {
    const mock = buildMock({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(topUpCredit(ORG_ID, 0, ACTOR_ID)).rejects.toThrow(/at least 1/);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("calls the top_up_credit RPC with the right args", async () => {
    const mock = buildMock({ data: { status: "ok", new_balance: 15 }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await topUpCredit(ORG_ID, 5, ACTOR_ID, "note");

    expect(mock.rpc).toHaveBeenCalledWith("top_up_credit", {
      p_client_id: ORG_ID,
      p_amount: 5,
      p_performed_by: ACTOR_ID,
      p_notes: "note",
    });
  });

  it("throws when the client is not found", async () => {
    const mock = buildMock({ data: { status: "not_found", new_balance: null }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(topUpCredit(ORG_ID, 5, ACTOR_ID)).rejects.toThrow("Client not found.");
  });

  it("audit-logs the top-up on success", async () => {
    const mock = buildMock({ data: { status: "ok", new_balance: 15 }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await topUpCredit(ORG_ID, 5, ACTOR_ID);

    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "credit.top_up",
      ACTOR_ID,
      null,
      expect.objectContaining({ orgId: ORG_ID, metadata: expect.objectContaining({ amount: 5, balance_after: 15 }) })
    );
  });

  it("throws the underlying DB error when the RPC call itself fails", async () => {
    const mock = buildMock({ data: null, error: { message: "connection lost" } });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(topUpCredit(ORG_ID, 5, ACTOR_ID)).rejects.toThrow("connection lost");
  });
});

// ─── deductCredit ───────────────────────────────────────────────────────────

describe("deductCredit", () => {
  it("throws when the client is not found", async () => {
    const mock = buildMock({ data: { status: "not_found", new_balance: null }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(deductCredit(ORG_ID, PROJECT_ID, ACTOR_ID)).rejects.toThrow("Client not found.");
  });

  it("on already_deducted: records a credit_race_events row and returns quietly (no throw, no notify/audit)", async () => {
    const mock = buildMock({ data: { status: "already_deducted", new_balance: 4 }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(deductCredit(ORG_ID, PROJECT_ID, ACTOR_ID)).resolves.toBeUndefined();

    expect(mock.insertCalls).toContainEqual(
      expect.objectContaining({
        table: "credit_race_events",
        payload: expect.objectContaining({
          client_id: ORG_ID,
          project_id: PROJECT_ID,
          event_type: "deduct_credit",
        }),
      })
    );
    expect(vi.mocked(notify)).not.toHaveBeenCalled();
    expect(vi.mocked(auditLog)).not.toHaveBeenCalled();
  });

  it("on insufficient_balance: notifies clients+admins and throws the dispatch-blocked error", async () => {
    const mock = buildMock(
      { data: { status: "insufficient_balance", new_balance: 0 }, error: null },
      {
        clients: () => chain({ name: "Acme" }),
        users: () => chain([{ id: "admin-1" }]),
      }
    );
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(deductCredit(ORG_ID, PROJECT_ID, ACTOR_ID)).rejects.toThrow(
      "Insufficient credit balance — dispatch blocked."
    );
    expect(vi.mocked(notify)).toHaveBeenCalled();
  });

  it("on ok: sends the deduction notification and audit-logs credit.deduction", async () => {
    const mock = buildMock(
      { data: { status: "ok", new_balance: 10 }, error: null },
      {
        clients: () => chain({ name: "Acme" }),
        users: () => chain([{ id: "admin-1" }]),
        projects: () => chain({ project_number: "OPS-1", site_address: null, extracted_fields: null }),
      }
    );
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await deductCredit(ORG_ID, PROJECT_ID, ACTOR_ID);

    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "credit_deduction", projectId: PROJECT_ID })
    );
    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "credit.deduction",
      ACTOR_ID,
      null,
      expect.objectContaining({ orgId: ORG_ID, projectId: PROJECT_ID })
    );
  });

  it("on ok with a low resulting balance: also fires a low-credit notification", async () => {
    const mock = buildMock(
      { data: { status: "ok", new_balance: 2 }, error: null },
      {
        clients: () => chain({ name: "Acme" }),
        users: () => chain([{ id: "admin-1" }]),
        projects: () => chain({ project_number: "OPS-1", site_address: null, extracted_fields: null }),
      }
    );
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await deductCredit(ORG_ID, PROJECT_ID, ACTOR_ID);

    const lowCreditCalls = vi.mocked(notify).mock.calls.filter(([opts]) => opts.type === "low_credit");
    expect(lowCreditCalls.length).toBeGreaterThan(0);
  });
});

// ─── debitDeferred ──────────────────────────────────────────────────────────

describe("debitDeferred", () => {
  it("throws when the client is not found", async () => {
    const mock = buildMock({ data: { status: "not_found", new_deferred_balance: null }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(debitDeferred(ORG_ID, PROJECT_ID, ACTOR_ID)).rejects.toThrow("Client not found.");
  });

  it("on already_deducted: records a credit_race_events row and returns quietly", async () => {
    const mock = buildMock({ data: { status: "already_deducted", new_deferred_balance: 3 }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(debitDeferred(ORG_ID, PROJECT_ID, ACTOR_ID)).resolves.toBeUndefined();

    expect(mock.insertCalls).toContainEqual(
      expect.objectContaining({
        table: "credit_race_events",
        payload: expect.objectContaining({ event_type: "debit_deferred" }),
      })
    );
    expect(vi.mocked(auditLog)).not.toHaveBeenCalled();
  });

  it("throws a frozen-account error on status=frozen", async () => {
    const mock = buildMock({ data: { status: "frozen", new_deferred_balance: 2 }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(debitDeferred(ORG_ID, PROJECT_ID, ACTOR_ID)).rejects.toThrow(/frozen/i);
  });

  it("throws a limit-reached error on status=limit_reached", async () => {
    const mock = buildMock({ data: { status: "limit_reached", new_deferred_balance: 5 }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(debitDeferred(ORG_ID, PROJECT_ID, ACTOR_ID)).rejects.toThrow(/limit/i);
  });

  it("audit-logs on success", async () => {
    const mock = buildMock({ data: { status: "ok", new_deferred_balance: 4 }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await debitDeferred(ORG_ID, PROJECT_ID, ACTOR_ID);

    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "credit.deferred_debit",
      ACTOR_ID,
      null,
      expect.objectContaining({ metadata: expect.objectContaining({ deferred_balance_after: 4 }) })
    );
  });
});

// ─── logUpfront ─────────────────────────────────────────────────────────────

describe("logUpfront", () => {
  it("throws when the client is not found", async () => {
    const mock = buildMock({ data: { status: "not_found", balance: null }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(logUpfront(ORG_ID, PROJECT_ID, ACTOR_ID)).rejects.toThrow("Client not found.");
  });

  it("on already_deducted: records a credit_race_events row and returns quietly", async () => {
    const mock = buildMock({ data: { status: "already_deducted", balance: 8 }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(logUpfront(ORG_ID, PROJECT_ID, ACTOR_ID)).resolves.toBeUndefined();

    expect(mock.insertCalls).toContainEqual(
      expect.objectContaining({
        table: "credit_race_events",
        payload: expect.objectContaining({ event_type: "log_upfront" }),
      })
    );
  });

  it("resolves without error on success", async () => {
    const mock = buildMock({ data: { status: "ok", balance: 8 }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(logUpfront(ORG_ID, PROJECT_ID, ACTOR_ID)).resolves.toBeUndefined();
  });
});

// ─── logOverride ────────────────────────────────────────────────────────────

describe("logOverride", () => {
  it("throws when the project is not found", async () => {
    const mock = buildMock({ data: { status: "not_found", balance: null }, error: null });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(logOverride(PROJECT_ID, ACTOR_ID, "reason text")).rejects.toThrow("Project not found.");
  });

  it("on already_deducted: records a credit_race_events row using the project's client_id", async () => {
    const mock = buildMock(
      { data: { status: "already_deducted", balance: 6 }, error: null },
      { projects: () => chain({ client_id: ORG_ID, project_number: "OPS-1", site_address: null, extracted_fields: null }) }
    );
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(logOverride(PROJECT_ID, ACTOR_ID, "reason text")).resolves.toBeUndefined();

    expect(mock.insertCalls).toContainEqual(
      expect.objectContaining({
        table: "credit_race_events",
        payload: expect.objectContaining({ event_type: "log_override", client_id: ORG_ID }),
      })
    );
    expect(vi.mocked(auditLog)).not.toHaveBeenCalled();
  });

  it("on success: notifies admins and audit-logs payment.override_applied", async () => {
    const mock = buildMock(
      { data: { status: "ok", balance: 6 }, error: null },
      {
        projects: () => chain({ client_id: ORG_ID, project_number: "OPS-1", site_address: null, extracted_fields: null }),
        users: () => chain([{ id: "admin-1" }]),
      }
    );
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await logOverride(PROJECT_ID, ACTOR_ID, "reason text");

    expect(vi.mocked(notify)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "payment_override", projectId: PROJECT_ID })
    );
    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "payment.override_applied",
      ACTOR_ID,
      null,
      expect.objectContaining({ projectId: PROJECT_ID, orgId: ORG_ID })
    );
  });
});
