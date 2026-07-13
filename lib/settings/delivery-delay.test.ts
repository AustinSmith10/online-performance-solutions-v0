import { describe, it, expect, vi } from "vitest";
import {
  getDeliveryDelayDurations,
  setDeliveryDelayDurations,
  DEFAULT_DELIVERY_DELAY_DURATIONS,
  DELIVERY_DELAY_DURATIONS_KEY,
} from "./delivery-delay";

function supabaseWithRow(value: unknown) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: value ? { value } : null, error: null }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    })),
  };
}

describe("getDeliveryDelayDurations", () => {
  it("returns defaults when no row exists", async () => {
    const supabase = supabaseWithRow(null);
    const durations = await getDeliveryDelayDurations(supabase as never);
    expect(durations).toEqual(DEFAULT_DELIVERY_DELAY_DURATIONS);
  });

  it("returns the stored durations when present", async () => {
    const supabase = supabaseWithRow({ normalHours: 12, extendedHours: 48 });
    const durations = await getDeliveryDelayDurations(supabase as never);
    expect(durations).toEqual({ normalHours: 12, extendedHours: 48 });
  });

  it("falls back to defaults when the stored value is malformed", async () => {
    const supabase = supabaseWithRow({ normalHours: 12 });
    const durations = await getDeliveryDelayDurations(supabase as never);
    expect(durations).toEqual(DEFAULT_DELIVERY_DELAY_DURATIONS);
  });
});

describe("setDeliveryDelayDurations", () => {
  it("rejects negative hours", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setDeliveryDelayDurations(supabase as never, {
      normalHours: -1,
      extendedHours: 48,
    });
    expect(result.error).toBeDefined();
  });

  it("rejects extended shorter than normal", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setDeliveryDelayDurations(supabase as never, {
      normalHours: 48,
      extendedHours: 24,
    });
    expect(result.error).toBeDefined();
  });

  it("upserts valid durations under the expected key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) };
    const result = await setDeliveryDelayDurations(
      supabase as never,
      { normalHours: 24, extendedHours: 72 },
      "user-1"
    );
    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("app_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: DELIVERY_DELAY_DURATIONS_KEY,
        value: { normalHours: 24, extendedHours: 72 },
        updated_by: "user-1",
      })
    );
  });
});
