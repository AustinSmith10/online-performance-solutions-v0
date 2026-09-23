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
