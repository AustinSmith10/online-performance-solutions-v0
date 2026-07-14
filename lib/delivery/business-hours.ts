import { isWorkingDay, addWorkingDays } from "./working-days";

export interface BusinessHours {
  start: string; // HH:MM, 24h
  end: string; // HH:MM, 24h
}

// Business hours are anchored to a single org-wide timezone — this is an
// AU-only product (state_territory codes, AU public holiday feed).
const BUSINESS_TIMEZONE = "Australia/Melbourne";

const partsFormatter = new Intl.DateTimeFormat("en-AU", {
  timeZone: BUSINESS_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

interface LocalParts {
  isoDate: string; // YYYY-MM-DD in the business timezone
  minutesOfDay: number; // minutes since local midnight
}

function toLocalParts(date: Date): LocalParts {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  // Intl renders midnight as "24:00" with hour12: false in some engines — normalize.
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return { isoDate: `${year}-${month}-${day}`, minutesOfDay: hour * 60 + minute };
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

// UTC midnight for the given business-timezone-local calendar date, used to
// probe isWorkingDay (which operates on UTC calendar dates, per working-days.ts).
function localMidnightAsUtcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function isWithinBusinessHours(
  date: Date,
  hours: BusinessHours,
  holidays: Set<string>
): boolean {
  const { isoDate, minutesOfDay } = toLocalParts(date);
  if (!isWorkingDay(localMidnightAsUtcDate(isoDate), holidays)) return false;
  return minutesOfDay >= timeToMinutes(hours.start) && minutesOfDay < timeToMinutes(hours.end);
}

// Returns the instant `date` if already within business hours, otherwise the
// next business-hours start (a working day's `hours.start`, in BUSINESS_TIMEZONE).
export function nextBusinessHoursStart(
  date: Date,
  hours: BusinessHours,
  holidays: Set<string>
): Date {
  if (isWithinBusinessHours(date, hours, holidays)) return date;

  const { isoDate, minutesOfDay } = toLocalParts(date);
  const startMinutes = timeToMinutes(hours.start);

  // If today is a working day and we're before the window opens, today's start applies.
  if (isWorkingDay(localMidnightAsUtcDate(isoDate), holidays) && minutesOfDay < startMinutes) {
    return localWindowStart(isoDate, hours.start);
  }

  // Otherwise walk forward day by day until we hit a working day.
  let probe = localMidnightAsUtcDate(isoDate);
  do {
    probe = new Date(probe.getTime() + 24 * 60 * 60 * 1000);
  } while (!isWorkingDay(probe, holidays));

  return localWindowStart(probe.toISOString().slice(0, 10), hours.start);
}

// Business-hours start of the Nth working day after `date`'s local calendar
// day (walking forward, skipping weekends/holidays). Used for "N working
// days" delivery-delay presets (#66).
export function nthWorkingDayStart(
  date: Date,
  n: number,
  hours: BusinessHours,
  holidays: Set<string>
): Date {
  const { isoDate } = toLocalParts(date);
  const target = addWorkingDays(localMidnightAsUtcDate(isoDate), n, holidays);
  return localWindowStart(target.toISOString().slice(0, 10), hours.start);
}

// Builds the instant corresponding to `time` (HH:MM) on `isoDate` in BUSINESS_TIMEZONE.
function localWindowStart(isoDate: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  // Resolve the UTC offset for BUSINESS_TIMEZONE on this date by comparing a UTC
  // guess against how it renders locally, then correcting.
  const guessUtc = new Date(`${isoDate}T${time}:00.000Z`);
  const rendered = toLocalParts(guessUtc);
  const renderedMinutes = rendered.minutesOfDay;
  const targetMinutes = h * 60 + m;
  let diffMinutes = targetMinutes - renderedMinutes;
  // Handle date-boundary wraparound when the local render lands on the adjacent day.
  if (rendered.isoDate < isoDate) diffMinutes += 24 * 60;
  else if (rendered.isoDate > isoDate) diffMinutes -= 24 * 60;
  return new Date(guessUtc.getTime() + diffMinutes * 60 * 1000);
}
