/**
 * Timezone-explicit date helpers. Every date the server stamps onto a
 * document, filename, email or due-date calculation goes through these with
 * the business timezone (lib/settings/timezone.ts) — never server-local
 * `Date` getters or `toISOString().slice(0, 10)`, which silently use the
 * host's zone / UTC and put the previous day on anything generated before
 * ~10am AEST (#188).
 */

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-AU", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  year: string; // YYYY
  month: string; // MM
  day: string; // DD
  hour: number; // 0-23
  minute: number;
}

/** Calendar/clock fields of `date` as seen in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    // Intl renders midnight as "24:00" with hour12: false in some engines — normalize.
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
  };
}

/** `YYYY-MM-DD` for the calendar day `date` falls on in `timeZone`. */
export function isoDateInTz(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

/** `DD/MM/YYYY` for the calendar day `date` falls on in `timeZone`. */
export function formatDateAU(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${day}/${month}/${year}`;
}

/** `D Month YYYY` (e.g. "5 April 2026") in `timeZone` — the long form used in email copy. */
export function formatLongDateAU(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-AU", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ─── Calendar dates (YYYY-MM-DD, no time of day) ─────────────────────────────
//
// Due dates are stored as plain calendar dates. lib/delivery/working-days.ts
// walks them as UTC-midnight Dates, so these convert between the two without
// ever touching the server's own zone.

/** UTC-midnight Date for a `YYYY-MM-DD` calendar date (the working-days.ts representation). */
export function calendarDateAsUtc(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

/** `YYYY-MM-DD` for a UTC-midnight calendar Date (inverse of calendarDateAsUtc). */
export function calendarDateOf(utcMidnight: Date): string {
  return isoDateInTz(utcMidnight, "UTC");
}

/** Calendar-date arithmetic: `isoDate` plus `days` whole days, DST-proof. */
export function addCalendarDays(isoDate: string, days: number): string {
  const d = calendarDateAsUtc(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return calendarDateOf(d);
}

/** `DD/MM/YYYY` for a stored `YYYY-MM-DD` calendar date. */
export function formatCalendarDateAU(isoDate: string): string {
  return formatDateAU(calendarDateAsUtc(isoDate), "UTC");
}
