import { describe, it, expect, vi } from "vitest";
import {
  getExtractionDailyLimit,
  setExtractionDailyLimit,
  DEFAULT_EXTRACTION_DAILY_LIMIT,
  EXTRACTION_DAILY_LIMIT_KEY,
} from "./extraction-budget";

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

describe("getExtractionDailyLimit", () => {
  it("returns the default when no row exists", async () => {
    const supabase = supabaseWithRow(null);
    const limit = await getExtractionDailyLimit(supabase as never);
    expect(limit).toBe(DEFAULT_EXTRACTION_DAILY_LIMIT);
  });

  it("returns the stored limit when present", async () => {
    const supabase = supabaseWithRow({ limit: 50 });
    const limit = await getExtractionDailyLimit(supabase as never);
    expect(limit).toBe(50);
  });

  it("falls back to the default when the stored value is malformed", async () => {
    const supabase = supabaseWithRow({ limit: "a lot" });
    const limit = await getExtractionDailyLimit(supabase as never);
    expect(limit).toBe(DEFAULT_EXTRACTION_DAILY_LIMIT);
  });

  it("falls back to the default when the stored limit is not positive", async () => {
    const supabase = supabaseWithRow({ limit: 0 });
    const limit = await getExtractionDailyLimit(supabase as never);
    expect(limit).toBe(DEFAULT_EXTRACTION_DAILY_LIMIT);
  });
});

describe("setExtractionDailyLimit", () => {
  it("rejects a non-positive value", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setExtractionDailyLimit(supabase as never, 0);
    expect(result.error).toBeDefined();
  });

  it("rejects a fractional value", async () => {
    const supabase = supabaseWithRow(null);
    const result = await setExtractionDailyLimit(supabase as never, 1.5);
    expect(result.error).toBeDefined();
  });

  it("upserts a valid limit under the expected key", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const supabase = { from: vi.fn(() => ({ upsert })) };
    const result = await setExtractionDailyLimit(supabase as never, 50, "user-1");
    expect(result.error).toBeUndefined();
    expect(supabase.from).toHaveBeenCalledWith("app_settings");
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: EXTRACTION_DAILY_LIMIT_KEY,
        value: { limit: 50 },
        updated_by: "user-1",
      })
    );
  });
});
