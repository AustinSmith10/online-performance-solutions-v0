import { describe, it, expect, vi } from "vitest";
import {
  getBusinessHours,
  setBusinessHours,
  DEFAULT_BUSINESS_HOURS,
  BUSINESS_HOURS_KEY,
} from "./business-hours";

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

describe("getBusinessHours", () => {
  it("returns defaults when no row exists", async () => {
    const supabase = supabaseWithRow(null);
    const hours = await getBusinessHours(supabase as never);
    expect(hours).toEqual(DEFAULT_BUSINESS_HOURS);
  });

  it("returns the stored hours when present", async () => {
    const supabase = supabaseWithRow({ start: "08:00", end: "16:00" });
    const hours = await getBusinessHours(supabase as never);
    expect(hours).toEqual({ start: "08:00", end: "16:00" });
  });

  it("falls back to defaults when the stored value is malformed", async () => {
    const supabase = supabaseWithRow({ start: "08:00" });
    const hours = await getBusinessHours(supabase as never);
    expect(hours).toEqual(DEFAULT_BUSINESS_HOURS);
  });
});

describe("setBusinessHours", () => {
  it("rejects invalid time formats", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setBusinessHours(supabase as never, { start: "9am", end: "17:00" });
    expect(result.error).toBeDefined();
  });

  it("rejects a start time that is not before the end time", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setBusinessHours(supabase as never, { start: "17:00", end: "09:00" });
    expect(result.error).toBeDefined();
  });

  it("upserts valid hours under the expected key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) };
    const result = await setBusinessHours(
      supabase as never,
      { start: "08:00", end: "16:30" },
      "user-1"
    );
    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("app_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: BUSINESS_HOURS_KEY,
        value: { start: "08:00", end: "16:30" },
        updated_by: "user-1",
      })
    );
  });
});
