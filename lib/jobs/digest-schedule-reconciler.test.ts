import { describe, it, expect, vi } from "vitest";
import { reconcileDigestSchedule, AVAILABLE_REQUESTS_DIGEST_QUEUE } from "./digest-schedule-reconciler";

function supabaseWithSchedule(value: { morning: string; afternoon: string } | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: value ? { value } : null, error: null }),
    })),
  };
}

describe("reconcileDigestSchedule", () => {
  it("applies the default schedule when no settings row exists", async () => {
    const schedule = vi.fn().mockResolvedValue(undefined);
    const boss = { schedule };
    const supabase = supabaseWithSchedule(null);

    await reconcileDigestSchedule(boss as never, supabase as never);

    expect(schedule).toHaveBeenCalledWith(
      AVAILABLE_REQUESTS_DIGEST_QUEUE,
      "0 9 * * *",
      {},
      { key: "morning" }
    );
    expect(schedule).toHaveBeenCalledWith(
      AVAILABLE_REQUESTS_DIGEST_QUEUE,
      "0 15 * * *",
      {},
      { key: "afternoon" }
    );
  });

  it("re-applies an updated schedule idempotently", async () => {
    const schedule = vi.fn().mockResolvedValue(undefined);
    const boss = { schedule };
    const supabase = supabaseWithSchedule({ morning: "07:15", afternoon: "17:45" });

    await reconcileDigestSchedule(boss as never, supabase as never);
    await reconcileDigestSchedule(boss as never, supabase as never);

    expect(schedule).toHaveBeenCalledTimes(4);
    expect(schedule).toHaveBeenCalledWith(
      AVAILABLE_REQUESTS_DIGEST_QUEUE,
      "15 7 * * *",
      {},
      { key: "morning" }
    );
    expect(schedule).toHaveBeenCalledWith(
      AVAILABLE_REQUESTS_DIGEST_QUEUE,
      "45 17 * * *",
      {},
      { key: "afternoon" }
    );
  });
});
