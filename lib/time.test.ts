import { describe, it, expect } from "vitest";
import {
  addCalendarDays,
  calendarDateAsUtc,
  calendarDateOf,
  formatCalendarDateAU,
  formatDateAU,
  formatLongDateAU,
  isoDateInTz,
  zonedParts,
} from "./time";

describe("lib/time — business-timezone date helpers (#188)", () => {
  describe("UTC/AEST day boundary", () => {
    // 23:30 UTC on 14 Jul = 09:30 AEST on 15 Jul.
    const lateUtc = new Date("2026-07-14T23:30:00.000Z");

    it("renders the next day in Brisbane", () => {
      expect(isoDateInTz(lateUtc, "Australia/Brisbane")).toBe("2026-07-15");
      expect(formatDateAU(lateUtc, "Australia/Brisbane")).toBe("15/07/2026");
    });

    it("differs from the UTC date that toISOString().slice(0,10) would give", () => {
      expect(lateUtc.toISOString().slice(0, 10)).toBe("2026-07-14");
    });

    it("renders the next day in Perth too (07:30 AWST)", () => {
      expect(isoDateInTz(lateUtc, "Australia/Perth")).toBe("2026-07-15");
    });

    it("keeps the same day just before AEST midnight", () => {
      // 13:59 UTC = 23:59 AEST same day.
      expect(isoDateInTz(new Date("2026-07-14T13:59:00.000Z"), "Australia/Brisbane")).toBe("2026-07-14");
      expect(isoDateInTz(new Date("2026-07-14T14:00:00.000Z"), "Australia/Brisbane")).toBe("2026-07-15");
    });
  });

  describe("AEDT/AEST daylight-saving transition", () => {
    // DST ends 5 Apr 2026 03:00 AEDT (= 16:00 UTC 4 Apr) → clocks go back to 02:00 AEST.
    it("applies AEDT (+11) before the switch in Sydney", () => {
      // 13:30 UTC 4 Apr = 00:30 AEDT 5 Apr (would still be 23:30 on the 4th at +10).
      const t = new Date("2026-04-04T13:30:00.000Z");
      expect(isoDateInTz(t, "Australia/Sydney")).toBe("2026-04-05");
      expect(isoDateInTz(t, "Australia/Brisbane")).toBe("2026-04-04");
    });

    it("applies AEST (+10) after the switch in Sydney", () => {
      // 13:30 UTC 5 Apr = 23:30 AEST 5 Apr (would be 00:30 on the 6th at +11).
      const t = new Date("2026-04-05T13:30:00.000Z");
      expect(isoDateInTz(t, "Australia/Sydney")).toBe("2026-04-05");
      expect(formatDateAU(t, "Australia/Sydney")).toBe("05/04/2026");
    });

    it("tracks DST start too (4 Oct 2026, AEST → AEDT)", () => {
      // 13:30 UTC 4 Oct = 00:30 AEDT 5 Oct in Melbourne, 23:30 AEST 4 Oct in Brisbane.
      const t = new Date("2026-10-04T13:30:00.000Z");
      expect(isoDateInTz(t, "Australia/Melbourne")).toBe("2026-10-05");
      expect(isoDateInTz(t, "Australia/Brisbane")).toBe("2026-10-04");
    });
  });

  it("normalises midnight to hour 0", () => {
    // 14:00 UTC = 00:00 AEST.
    expect(zonedParts(new Date("2026-07-14T14:00:00.000Z"), "Australia/Brisbane").hour).toBe(0);
  });

  it("formats the long email form in the business timezone", () => {
    expect(formatLongDateAU(new Date("2026-07-14T23:30:00.000Z"), "Australia/Brisbane")).toBe("15 July 2026");
  });
});

describe("calendar-date helpers", () => {
  it("round-trips a calendar date through its UTC-midnight form", () => {
    expect(calendarDateOf(calendarDateAsUtc("2026-04-05"))).toBe("2026-04-05");
  });

  it("adds whole days across month ends and the DST switch", () => {
    expect(addCalendarDays("2026-01-30", 3)).toBe("2026-02-02");
    expect(addCalendarDays("2026-04-04", 1)).toBe("2026-04-05");
    expect(addCalendarDays("2026-10-03", 2)).toBe("2026-10-05");
  });

  it("formats a stored calendar date as DD/MM/YYYY with no zone shift", () => {
    expect(formatCalendarDateAU("2026-09-23")).toBe("23/09/2026");
  });
});
