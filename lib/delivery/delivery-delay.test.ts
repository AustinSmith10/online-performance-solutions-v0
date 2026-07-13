import { describe, it, expect } from "vitest";
import { computeEffectiveDeliveryTime } from "./delivery-delay";

const NO_HOLIDAYS = new Set<string>();
const HOURS = { start: "09:00", end: "17:00" };
const DURATIONS = { normalHours: 24, extendedHours: 72 };

describe("computeEffectiveDeliveryTime", () => {
  it("expedited delivers immediately when already within business hours", () => {
    // 2024-01-08T22:00:00Z = 2024-01-09 09:00 AEDT (Tuesday)
    const now = new Date("2024-01-08T22:00:00.000Z");
    const result = computeEffectiveDeliveryTime(now, "expedited", DURATIONS, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe(now.toISOString());
  });

  it("expedited defers to the next business-hours window when now is outside it", () => {
    // 2024-01-08T12:00:00Z = 2024-01-08 23:00 AEDT (Monday night) -> Tue 9am AEDT
    const now = new Date("2024-01-08T12:00:00.000Z");
    const result = computeEffectiveDeliveryTime(now, "expedited", DURATIONS, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-08T22:00:00.000Z");
  });

  it("normal delays by the configured hours, staying within business hours", () => {
    // 2024-01-08T22:00:00Z = 2024-01-09 09:00 AEDT (Tuesday) + 24h = Wed 09:00 AEDT
    const now = new Date("2024-01-08T22:00:00.000Z");
    const result = computeEffectiveDeliveryTime(now, "normal", DURATIONS, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-09T22:00:00.000Z");
  });

  it("normal rolls forward when the delayed instant lands outside business hours", () => {
    // 2024-01-08T22:00:00Z = Tue 09:00 AEDT + 8h = Tue 17:00 AEDT (window closes at 17:00,
    // exclusive) -> next window is Wed 09:00 AEDT
    const now = new Date("2024-01-08T22:00:00.000Z");
    const shortDurations = { normalHours: 8, extendedHours: 72 };
    const result = computeEffectiveDeliveryTime(now, "normal", shortDurations, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-09T22:00:00.000Z");
  });

  it("extended rolls the delayed instant across a weekend", () => {
    // 2024-01-04T22:00:00Z = 2024-01-05 09:00 AEDT (Friday) + 72h = Mon 09:00 -> Mon window
    const now = new Date("2024-01-04T22:00:00.000Z");
    const result = computeEffectiveDeliveryTime(now, "extended", DURATIONS, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-07T22:00:00.000Z");
  });

  it("uses zero delay for expedited even if durations would otherwise apply", () => {
    const now = new Date("2024-01-08T22:00:00.000Z");
    const result = computeEffectiveDeliveryTime(
      now,
      "expedited",
      { normalHours: 1000, extendedHours: 2000 },
      HOURS,
      NO_HOLIDAYS
    );
    expect(result.toISOString()).toBe(now.toISOString());
  });
});
