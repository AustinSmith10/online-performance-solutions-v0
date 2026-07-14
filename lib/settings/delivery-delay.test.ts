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
    const stored = {
      normal: { unit: "hours", value: 12 },
      extended: { unit: "workingDays", value: 5 },
    };
    const supabase = supabaseWithRow(stored);
    const durations = await getDeliveryDelayDurations(supabase as never);
    expect(durations).toEqual(stored);
  });

  it("falls back to defaults when the stored value is malformed", async () => {
    const supabase = supabaseWithRow({ normal: { unit: "hours", value: 12 } });
    const durations = await getDeliveryDelayDurations(supabase as never);
    expect(durations).toEqual(DEFAULT_DELIVERY_DELAY_DURATIONS);
  });

  it("falls back to defaults when a unit is invalid", async () => {
    const supabase = supabaseWithRow({
      normal: { unit: "days", value: 1 },
      extended: { unit: "workingDays", value: 7 },
    });
    const durations = await getDeliveryDelayDurations(supabase as never);
    expect(durations).toEqual(DEFAULT_DELIVERY_DELAY_DURATIONS);
  });
});

describe("setDeliveryDelayDurations", () => {
  it("rejects a non-positive value", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setDeliveryDelayDurations(supabase as never, {
      normal: { unit: "workingDays", value: 0 },
      extended: { unit: "workingDays", value: 7 },
    });
    expect(result.error).toBeDefined();
  });

  it("rejects a fractional working-days value", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setDeliveryDelayDurations(supabase as never, {
      normal: { unit: "workingDays", value: 1.5 },
      extended: { unit: "workingDays", value: 7 },
    });
    expect(result.error).toBeDefined();
  });

  it("allows a fractional hours value", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) };
    const result = await setDeliveryDelayDurations(supabase as never, {
      normal: { unit: "hours", value: 12.5 },
      extended: { unit: "workingDays", value: 7 },
    });
    expect(result.error).toBeUndefined();
  });

  it("upserts valid durations under the expected key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) };
    const durations = {
      normal: { unit: "workingDays" as const, value: 1 },
      extended: { unit: "workingDays" as const, value: 7 },
    };
    const result = await setDeliveryDelayDurations(supabase as never, durations, "user-1");
    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("app_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: DELIVERY_DELAY_DURATIONS_KEY,
        value: durations,
        updated_by: "user-1",
      })
    );
  });
});
