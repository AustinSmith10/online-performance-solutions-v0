import { describe, it, expect, vi } from "vitest";
import {
  getBusinessTimezone,
  setBusinessTimezone,
  AU_TIMEZONES,
  BUSINESS_TIMEZONE_KEY,
  DEFAULT_BUSINESS_TIMEZONE,
} from "./timezone";

function supabaseWithRow(value: unknown) {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  return {
    upsert,
    client: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: value ? { value } : null, error: null }),
        upsert,
      })),
    } as never,
  };
}

describe("getBusinessTimezone", () => {
  it("defaults to Australia/Brisbane when unset", async () => {
    expect(DEFAULT_BUSINESS_TIMEZONE).toBe("Australia/Brisbane");
    expect(await getBusinessTimezone(supabaseWithRow(null).client)).toBe("Australia/Brisbane");
  });

  it("returns the stored zone", async () => {
    expect(await getBusinessTimezone(supabaseWithRow({ timeZone: "Australia/Perth" }).client)).toBe(
      "Australia/Perth"
    );
  });

  it("falls back to the default for a non-AU or garbage value", async () => {
    expect(await getBusinessTimezone(supabaseWithRow({ timeZone: "UTC" }).client)).toBe(
      DEFAULT_BUSINESS_TIMEZONE
    );
    expect(await getBusinessTimezone(supabaseWithRow({ timeZone: 5 }).client)).toBe(
      DEFAULT_BUSINESS_TIMEZONE
    );
  });
});

describe("setBusinessTimezone", () => {
  it("upserts the business_timezone key", async () => {
    const sb = supabaseWithRow(null);
    expect(await setBusinessTimezone(sb.client, "Australia/Sydney", "u-1")).toEqual({});
    expect(sb.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        key: BUSINESS_TIMEZONE_KEY,
        value: { timeZone: "Australia/Sydney" },
        updated_by: "u-1",
      })
    );
  });

  it("rejects zones outside the AU list", async () => {
    const sb = supabaseWithRow(null);
    expect((await setBusinessTimezone(sb.client, "Europe/London")).error).toBeTruthy();
    expect(sb.upsert).not.toHaveBeenCalled();
  });

  it("offers exactly the eight Australian zones, all valid IANA names", () => {
    expect(AU_TIMEZONES.map((tz) => tz.value.split("/")[1])).toEqual([
      "Brisbane", "Sydney", "Melbourne", "Canberra", "Hobart", "Adelaide", "Darwin", "Perth",
    ]);
    for (const tz of AU_TIMEZONES) {
      expect(() => new Intl.DateTimeFormat("en-AU", { timeZone: tz.value })).not.toThrow();
    }
  });
});
