import { describe, it, expect } from "vitest";
import { computeEffectiveDeliveryTime, type DeliveryDelayDurations } from "./delivery-delay";

const NO_HOLIDAYS = new Set<string>();
const HOURS = { start: "09:00", end: "17:00" };
const DURATIONS: DeliveryDelayDurations = {
  normal: { unit: "workingDays", value: 1 },
  extended: { unit: "workingDays", value: 7 },
};

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

  it("normal (1 working day) lands on the next working day's opening time", () => {
    // 2024-01-08T22:00:00Z = Tue 09:00 AEDT -> 1 working day later = Wed 09:00 AEDT
    const now = new Date("2024-01-08T22:00:00.000Z");
    const result = computeEffectiveDeliveryTime(now, "normal", DURATIONS, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-09T22:00:00.000Z");
  });

  it("normal (1 working day) skips the weekend", () => {
    // Friday 2024-01-05 09:00 AEDT + 1 working day -> Monday 2024-01-08 09:00 AEDT
    const now = new Date("2024-01-04T22:00:00.000Z");
    const result = computeEffectiveDeliveryTime(now, "normal", DURATIONS, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-07T22:00:00.000Z");
  });

  it("extended (7 working days) skips a full weekend in between", () => {
    // Tuesday 2024-01-09 09:00 AEDT + 7 working days -> Thursday 2024-01-18 09:00 AEDT
    const now = new Date("2024-01-08T22:00:00.000Z");
    const result = computeEffectiveDeliveryTime(now, "extended", DURATIONS, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-17T22:00:00.000Z");
  });

  it("working-days presets skip public holidays too", () => {
    const holidays = new Set(["2024-01-09"]); // Tuesday
    const now = new Date("2024-01-08T12:00:00.000Z"); // Monday
    const oneDay: DeliveryDelayDurations = {
      normal: { unit: "workingDays", value: 1 },
      extended: DURATIONS.extended,
    };
    const result = computeEffectiveDeliveryTime(now, "normal", oneDay, HOURS, holidays);
    // Monday -> next working day skipping the Tue holiday -> Wed 09:00 AEDT
    expect(result.toISOString()).toBe("2024-01-09T22:00:00.000Z");
  });

  it("hours unit delays by the configured hours, staying within business hours", () => {
    const now = new Date("2024-01-08T22:00:00.000Z"); // Tue 09:00 AEDT
    const durations: DeliveryDelayDurations = {
      normal: { unit: "hours", value: 24 },
      extended: DURATIONS.extended,
    };
    const result = computeEffectiveDeliveryTime(now, "normal", durations, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-09T22:00:00.000Z");
  });

  it("hours unit rolls forward when the delayed instant lands outside business hours", () => {
    // Tue 09:00 AEDT + 8h = Tue 17:00 AEDT (window end, exclusive) -> next window Wed 09:00 AEDT
    const now = new Date("2024-01-08T22:00:00.000Z");
    const durations: DeliveryDelayDurations = {
      normal: { unit: "hours", value: 8 },
      extended: DURATIONS.extended,
    };
    const result = computeEffectiveDeliveryTime(now, "normal", durations, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-09T22:00:00.000Z");
  });
});
