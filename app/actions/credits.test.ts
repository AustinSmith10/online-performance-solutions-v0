import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/auth/session");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/payments/ledger");

import { overridePaymentGateAction } from "./credits";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { logOverride } from "@/lib/payments/ledger";
import { redirect } from "next/navigation";

const PROJECT_ID = "proj-1";
const ACTOR = { id: "actor-1", email: "admin@ops.test" };

function makeSupabase(project: Record<string, unknown> | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }),
    }),
  };
}

function makeReasonFormData(reason = "a valid reason over ten chars"): FormData {
  const fd = new FormData();
  fd.append("reason", reason);
  return fd;
}

beforeEach(() => {
  vi.mocked(requireRole).mockReset().mockResolvedValue(ACTOR as never);
  vi.mocked(logOverride).mockReset().mockResolvedValue(undefined);
  vi.mocked(redirect).mockReset();
});

describe("overridePaymentGateAction", () => {
  it("rejects a project whose payment was already resolved normally, instead of silently no-op'ing to the success page", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ payment_override: false, status: "in_progress", credit_deducted: true }) as never
    );

    const result = await overridePaymentGateAction(PROJECT_ID, {}, makeReasonFormData());

    expect(result.error).toBe(
      "This project's payment has already been resolved — there is no payment gate to override."
    );
    expect(logOverride).not.toHaveBeenCalled();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("proceeds when the project is genuinely payment-gate-blocked", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ payment_override: false, status: "in_progress", credit_deducted: false }) as never
    );

    await overridePaymentGateAction(PROJECT_ID, {}, makeReasonFormData());

    expect(logOverride).toHaveBeenCalledWith(PROJECT_ID, ACTOR.id, "a valid reason over ten chars");
    expect(redirect).toHaveBeenCalledWith(`/admin/projects/${PROJECT_ID}?payment_overridden=1`);
  });

  it("still rejects an already-overridden project", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ payment_override: true, status: "in_progress", credit_deducted: true }) as never
    );

    const result = await overridePaymentGateAction(PROJECT_ID, {}, makeReasonFormData());

    expect(result.error).toBe("This project already has a payment override applied.");
    expect(logOverride).not.toHaveBeenCalled();
  });

  it("still rejects a paused project", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ payment_override: false, status: "paused", credit_deducted: false }) as never
    );

    const result = await overridePaymentGateAction(PROJECT_ID, {}, makeReasonFormData());

    expect(result.error).toBe(
      "Cannot apply a payment override while the project is paused. Resume the project first."
    );
    expect(logOverride).not.toHaveBeenCalled();
  });
});
