import { describe, it, expect } from "vitest";
import { isWithinBusinessHours, nextBusinessHoursStart, nthWorkingDayStart } from "./business-hours";

const NO_HOLIDAYS = new Set<string>();
const HOURS = { start: "09:00", end: "17:00" };

describe("isWithinBusinessHours", () => {
  it("is true at the start of the window on a weekday (AEDT, UTC+11)", () => {
    // 2024-01-08T22:00:00Z = 2024-01-09 09:00 AEDT (Tuesday)
    expect(isWithinBusinessHours(new Date("2024-01-08T22:00:00.000Z"), HOURS, NO_HOLIDAYS)).toBe(
      true
    );
  });

  it("is false one minute before the window opens", () => {
    expect(isWithinBusinessHours(new Date("2024-01-08T21:59:00.000Z"), HOURS, NO_HOLIDAYS)).toBe(
      false
    );
  });

  it("is false at the end boundary (exclusive)", () => {
    // 2024-01-09T06:00:00Z = 2024-01-09 17:00 AEDT
    expect(isWithinBusinessHours(new Date("2024-01-09T06:00:00.000Z"), HOURS, NO_HOLIDAYS)).toBe(
      false
    );
  });

  it("is false during business hours on a weekend", () => {
    // 2024-01-06 is a Saturday. 2024-01-06T00:00:00Z = 2024-01-06 11:00 AEDT
    expect(isWithinBusinessHours(new Date("2024-01-06T00:00:00.000Z"), HOURS, NO_HOLIDAYS)).toBe(
      false
    );
  });

  it("is false during business hours on a public holiday", () => {
    const holidays = new Set(["2024-01-09"]);
    expect(isWithinBusinessHours(new Date("2024-01-08T22:00:00.000Z"), HOURS, holidays)).toBe(
      false
    );
  });

  it("holds across the AEST/AEDT boundary (UTC+10, June)", () => {
    // 2024-06-09T23:00:00Z = 2024-06-10 09:00 AEST (Monday)
    expect(isWithinBusinessHours(new Date("2024-06-09T23:00:00.000Z"), HOURS, NO_HOLIDAYS)).toBe(
      true
    );
  });
});

describe("nextBusinessHoursStart", () => {
  it("returns the same instant when already within business hours", () => {
    const date = new Date("2024-01-08T22:00:00.000Z");
    expect(nextBusinessHoursStart(date, HOURS, NO_HOLIDAYS).toISOString()).toBe(
      date.toISOString()
    );
  });

  it("rolls forward to today's start when before the window on a working day", () => {
    // 2024-01-08T20:00:00Z = 2024-01-09 07:00 AEDT (Tuesday, before 9am)
    const result = nextBusinessHoursStart(
      new Date("2024-01-08T20:00:00.000Z"),
      HOURS,
      NO_HOLIDAYS
    );
    expect(result.toISOString()).toBe("2024-01-08T22:00:00.000Z");
  });

  it("rolls forward to the next working day when after the window", () => {
    // 2024-01-08T12:00:00Z = 2024-01-08 23:00 AEDT (Monday night) -> Tue 9am AEDT
    const result = nextBusinessHoursStart(
      new Date("2024-01-08T12:00:00.000Z"),
      HOURS,
      NO_HOLIDAYS
    );
    expect(result.toISOString()).toBe("2024-01-08T22:00:00.000Z");
  });

  it("skips the weekend", () => {
    // 2024-01-06T05:00:00Z = 2024-01-06 16:00 AEDT (Saturday) -> Mon 9am AEDT
    const result = nextBusinessHoursStart(
      new Date("2024-01-06T05:00:00.000Z"),
      HOURS,
      NO_HOLIDAYS
    );
    expect(result.toISOString()).toBe("2024-01-07T22:00:00.000Z");
  });

  it("skips a public holiday", () => {
    // 2024-01-09 (Tuesday) is a holiday -> next window is Wed 2024-01-10 09:00 AEDT
    const holidays = new Set(["2024-01-09"]);
    const result = nextBusinessHoursStart(
      new Date("2024-01-08T12:00:00.000Z"),
      HOURS,
      holidays
    );
    expect(result.toISOString()).toBe("2024-01-09T22:00:00.000Z");
  });
});

describe("nthWorkingDayStart", () => {
  it("lands on the next working day for n=1", () => {
    // 2024-01-08T22:00:00Z = Tue 09:00 AEDT -> Wed 09:00 AEDT
    const result = nthWorkingDayStart(new Date("2024-01-08T22:00:00.000Z"), 1, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-09T22:00:00.000Z");
  });

  it("skips weekends when counting working days", () => {
    // Friday 2024-01-05 09:00 AEDT -> 1 working day later is Monday 2024-01-08 09:00 AEDT
    const result = nthWorkingDayStart(new Date("2024-01-04T22:00:00.000Z"), 1, HOURS, NO_HOLIDAYS);
    expect(result.toISOString()).toBe("2024-01-07T22:00:00.000Z");
  });

  it("skips public holidays when counting working days", () => {
    const holidays = new Set(["2024-01-09"]); // Tuesday
    // Monday 2024-01-08 -> Tue is a holiday -> lands on Wed 2024-01-10 09:00 AEDT
    const result = nthWorkingDayStart(new Date("2024-01-08T12:00:00.000Z"), 1, HOURS, holidays);
    expect(result.toISOString()).toBe("2024-01-09T22:00:00.000Z");
  });
});
