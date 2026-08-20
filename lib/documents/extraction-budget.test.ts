import { describe, it, expect, vi } from "vitest";
import { claimExtractionSlot } from "./extraction-budget";

function supabaseMock({
  limit = 30,
  rpcResult,
}: {
  limit?: number;
  rpcResult: { data: { status: string; remaining: number } | null; error: unknown };
}) {
  const single = vi.fn().mockResolvedValue(rpcResult);
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { value: { limit } }, error: null }),
    })),
    rpc: vi.fn(() => ({ single })),
  };
}

describe("claimExtractionSlot", () => {
  it("allows the call when the RPC returns ok", async () => {
    const supabase = supabaseMock({ rpcResult: { data: { status: "ok", remaining: 5 }, error: null } });
    const result = await claimExtractionSlot(supabase as never, "user-1");
    expect(result).toEqual({ allowed: true, limit: 30 });
    expect(supabase.rpc).toHaveBeenCalledWith("claim_extraction_slot", {
      p_user_id: "user-1",
      p_limit: 30,
    });
  });

  it("denies the call when the RPC returns limit_reached", async () => {
    const supabase = supabaseMock({
      rpcResult: { data: { status: "limit_reached", remaining: 0 }, error: null },
    });
    const result = await claimExtractionSlot(supabase as never, "user-1");
    expect(result).toEqual({ allowed: false, limit: 30 });
  });

  it("uses the configured limit, not a hardcoded default", async () => {
    const supabase = supabaseMock({
      limit: 5,
      rpcResult: { data: { status: "ok", remaining: 4 }, error: null },
    });
    await claimExtractionSlot(supabase as never, "user-1");
    expect(supabase.rpc).toHaveBeenCalledWith("claim_extraction_slot", {
      p_user_id: "user-1",
      p_limit: 5,
    });
  });

  it("fails open (allows) when the RPC errors, matching the #153 kill-switch convention", async () => {
    const supabase = supabaseMock({
      rpcResult: { data: null, error: { message: "db unavailable" } },
    });
    const result = await claimExtractionSlot(supabase as never, "user-1");
    expect(result.allowed).toBe(true);
  });
});
