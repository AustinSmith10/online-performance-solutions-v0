import { describe, it, expect, vi } from "vitest";
import {
  getDigestSchedule,
  setDigestSchedule,
  timeToCron,
  isValidTime,
  DEFAULT_DIGEST_SCHEDULE,
  DIGEST_SCHEDULE_KEY,
} from "./digest-schedule";

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

describe("getDigestSchedule", () => {
  it("returns defaults when no row exists", async () => {
    const supabase = supabaseWithRow(null);
    const schedule = await getDigestSchedule(supabase as never);
    expect(schedule).toEqual(DEFAULT_DIGEST_SCHEDULE);
  });

  it("returns the stored schedule when present", async () => {
    const supabase = supabaseWithRow({ morning: "08:30", afternoon: "16:45" });
    const schedule = await getDigestSchedule(supabase as never);
    expect(schedule).toEqual({ morning: "08:30", afternoon: "16:45" });
  });

  it("falls back to defaults when the stored value is malformed", async () => {
    const supabase = supabaseWithRow({ morning: "08:30" });
    const schedule = await getDigestSchedule(supabase as never);
    expect(schedule).toEqual(DEFAULT_DIGEST_SCHEDULE);
  });
});

describe("setDigestSchedule", () => {
  it("rejects invalid time formats", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setDigestSchedule(supabase as never, { morning: "9am", afternoon: "15:00" });
    expect(result.error).toBeDefined();
  });

  it("upserts valid schedules under the expected key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) };
    const result = await setDigestSchedule(supabase as never, { morning: "07:00", afternoon: "14:30" }, "user-1");
    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("app_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: DIGEST_SCHEDULE_KEY,
        value: { morning: "07:00", afternoon: "14:30" },
        updated_by: "user-1",
      })
    );
  });
});

describe("isValidTime", () => {
  it("accepts valid 24h HH:MM strings", () => {
    expect(isValidTime("00:00")).toBe(true);
    expect(isValidTime("23:59")).toBe(true);
  });

  it("rejects invalid strings", () => {
    expect(isValidTime("24:00")).toBe(false);
    expect(isValidTime("9:00")).toBe(false);
    expect(isValidTime("09:60")).toBe(false);
    expect(isValidTime("abc")).toBe(false);
  });
});

describe("timeToCron", () => {
  it("converts HH:MM to a daily cron expression", () => {
    expect(timeToCron("09:00")).toBe("0 9 * * *");
    expect(timeToCron("15:30")).toBe("30 15 * * *");
    expect(timeToCron("00:05")).toBe("5 0 * * *");
  });
});
