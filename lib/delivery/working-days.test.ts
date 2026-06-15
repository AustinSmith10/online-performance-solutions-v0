import { describe, it, expect } from "vitest";
import { addWorkingDays } from "./working-days";

const NO_HOLIDAYS = new Set<string>();

function utcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe("addWorkingDays", () => {
  describe("basic counting", () => {
    it("adds 1 working day on a Monday", () => {
      // 2024-01-08 is Monday → result should be Tuesday 2024-01-09
      expect(iso(addWorkingDays(utcDate("2024-01-08"), 1, NO_HOLIDAYS))).toBe("2024-01-09");
    });

    it("adds 5 working days from Monday", () => {
      // Mon 2024-01-08 + 5 = Mon 2024-01-15
      expect(iso(addWorkingDays(utcDate("2024-01-08"), 5, NO_HOLIDAYS))).toBe("2024-01-15");
    });

    it("adds 0 working days returns the same day", () => {
      expect(iso(addWorkingDays(utcDate("2024-01-08"), 0, NO_HOLIDAYS))).toBe("2024-01-08");
    });
  });

  describe("weekend skipping", () => {
    it("skips Saturday and Sunday when counting forward from Friday", () => {
      // Fri 2024-01-05 + 1 working day = Mon 2024-01-08
      expect(iso(addWorkingDays(utcDate("2024-01-05"), 1, NO_HOLIDAYS))).toBe("2024-01-08");
    });

    it("skips the weekend when starting on Saturday", () => {
      // Sat 2024-01-06 + 1 working day = Mon 2024-01-08
      expect(iso(addWorkingDays(utcDate("2024-01-06"), 1, NO_HOLIDAYS))).toBe("2024-01-08");
    });

    it("skips the weekend when starting on Sunday", () => {
      // Sun 2024-01-07 + 1 working day = Mon 2024-01-08
      expect(iso(addWorkingDays(utcDate("2024-01-07"), 1, NO_HOLIDAYS))).toBe("2024-01-08");
    });

    it("counts 5 days across a weekend", () => {
      // Wed 2024-01-10 + 5 = Wed 2024-01-17
      expect(iso(addWorkingDays(utcDate("2024-01-10"), 5, NO_HOLIDAYS))).toBe("2024-01-17");
    });
  });

  describe("public holiday skipping", () => {
    it("skips a single holiday that falls mid-week", () => {
      // Mon 2024-01-08 + 1 day, but Tue is a holiday → Wed 2024-01-10
      const holidays = new Set(["2024-01-09"]);
      expect(iso(addWorkingDays(utcDate("2024-01-08"), 1, holidays))).toBe("2024-01-10");
    });

    it("skips multiple consecutive holidays", () => {
      // Mon 2024-01-08, Tue+Wed are holidays → +1 working day lands on Thu 2024-01-11
      const holidays = new Set(["2024-01-09", "2024-01-10"]);
      expect(iso(addWorkingDays(utcDate("2024-01-08"), 1, holidays))).toBe("2024-01-11");
    });

    it("does not count a holiday on the start date as a working day", () => {
      // Start Mon, add 1 day. Holiday is Mon itself — but start date is never counted.
      // The loop begins counting from day+1, so Mon holiday doesn't affect anything.
      const holidays = new Set(["2024-01-08"]); // the start date
      expect(iso(addWorkingDays(utcDate("2024-01-08"), 1, holidays))).toBe("2024-01-09");
    });

    it("handles a public holiday on a Friday pushing to the following Tuesday", () => {
      // Thu 2024-01-04 + 1 day. Fri 2024-01-05 is a holiday → Mon 2024-01-08
      const holidays = new Set(["2024-01-05"]);
      expect(iso(addWorkingDays(utcDate("2024-01-04"), 1, holidays))).toBe("2024-01-08");
    });

    it("handles a public holiday on a Monday", () => {
      // Fri 2024-01-05 + 1 day. Mon 2024-01-08 is a holiday → Tue 2024-01-09
      const holidays = new Set(["2024-01-08"]);
      expect(iso(addWorkingDays(utcDate("2024-01-05"), 1, holidays))).toBe("2024-01-09");
    });
  });

  describe("year boundary", () => {
    it("crosses from December into January", () => {
      // Tue 2024-12-24 + 5 working days, no holidays
      // Wed 25 ✓, Thu 26 ✓, Fri 27 ✓, skip Sat 28 + Sun 29, Mon 30 ✓, Tue 31 ✓ = 5 days
      expect(iso(addWorkingDays(utcDate("2024-12-24"), 5, NO_HOLIDAYS))).toBe("2024-12-31");
    });

    it("crosses year boundary with Christmas + Boxing Day as holidays", () => {
      // Mon 2024-12-23 + 5 working days
      // Tue 24 ✓, Wed 25 holiday, Thu 26 holiday, Fri 27 ✓, Sat 28 skip, Sun 29 skip
      // Mon 30 ✓, Tue 31 ✓, Wed 1 Jan ✓ → 5 days = Wed 2025-01-01
      const holidays = new Set(["2024-12-25", "2024-12-26"]);
      expect(iso(addWorkingDays(utcDate("2024-12-23"), 5, holidays))).toBe("2025-01-01");
    });

    it("handles New Year's Day as a holiday", () => {
      // Thu 2024-12-26 + 5 working days
      // Fri 27 ✓, Sat skip, Sun skip, Mon 30 ✓, Tue 31 ✓, Wed 1 Jan holiday, Thu 2 ✓, Fri 3 ✓ = 5 days
      const holidays = new Set(["2025-01-01"]);
      expect(iso(addWorkingDays(utcDate("2024-12-26"), 5, holidays))).toBe("2025-01-03");
    });
  });

  describe("realistic AU delivery scenarios", () => {
    it("5 working days from a typical Tuesday, NSW — no holidays", () => {
      // Tue 2024-03-05 + 5 = Tue 2024-03-12
      expect(iso(addWorkingDays(utcDate("2024-03-05"), 5, NO_HOLIDAYS))).toBe("2024-03-12");
    });

    it("5 working days spanning Easter long weekend (Good Fri + Easter Mon)", () => {
      // Mon 2024-03-25 + 5 working days
      // Good Fri 29 Mar, Easter Mon 1 Apr are holidays
      // Tue 26 ✓, Wed 27 ✓, Thu 28 ✓, Fri 29 holiday, Sat skip, Sun skip
      // Mon 1 Apr holiday, Tue 2 ✓, Wed 3 ✓ = 5 days → Wed 2024-04-03
      const holidays = new Set(["2024-03-29", "2024-04-01"]);
      expect(iso(addWorkingDays(utcDate("2024-03-25"), 5, holidays))).toBe("2024-04-03");
    });

    it("10 working days (2 weeks) no holidays", () => {
      // Mon 2024-01-08 + 10: fills Tue–Fri of week 1 (4), Mon–Fri of week 2 (5), Mon Jan 22 (1) = Mon 2024-01-22
      expect(iso(addWorkingDays(utcDate("2024-01-08"), 10, NO_HOLIDAYS))).toBe("2024-01-22");
    });
  });
});
