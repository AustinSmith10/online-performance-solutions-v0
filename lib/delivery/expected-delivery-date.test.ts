import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/delivery/public-holidays", () => ({ getPublicHolidays: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/settings/timezone", () => ({ getBusinessTimezone: vi.fn() }));

import { computeExpectedDeliveryDate } from "./expected-delivery-date";
import { getBusinessTimezone } from "@/lib/settings/timezone";

beforeEach(() => {
  vi.mocked(getBusinessTimezone).mockResolvedValue("Australia/Brisbane");
});

describe("computeExpectedDeliveryDate (#188)", () => {
  it("counts from the business-timezone day, not the UTC day", async () => {
    // Sun 20 Sep 2026 23:30 UTC = Mon 21 Sep 09:30 AEST. 5 working days from Mon → Mon 28 Sep.
    // Counting from the UTC day (Sun) would give Fri 25 Sep.
    const now = new Date("2026-09-20T23:30:00.000Z");
    expect(await computeExpectedDeliveryDate({} as never, 5, "QLD", now)).toBe("2026-09-28");
  });

  it("uses the configured zone", async () => {
    vi.mocked(getBusinessTimezone).mockResolvedValue("Australia/Perth");
    // Sun 20 Sep 2026 15:30 UTC = Sun 23:30 AWST but Mon 01:30 AEST.
    const now = new Date("2026-09-20T15:30:00.000Z");
    expect(await computeExpectedDeliveryDate({} as never, 1, "WA", now)).toBe("2026-09-21");
  });
});
