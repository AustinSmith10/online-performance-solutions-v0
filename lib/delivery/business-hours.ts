import { isWorkingDay, addWorkingDays } from "./working-days";
import { zonedParts } from "@/lib/time";

export interface BusinessHours {
  start: string; // HH:MM, 24h
  end: string; // HH:MM, 24h
}

/**
 * Business hours plus the timezone they're anchored to. The zone is the
 * single platform-wide business timezone setting (#187,
 * lib/settings/timezone.ts) — callers load it alongside getBusinessHours.
 */
export interface BusinessClock extends BusinessHours {
  timeZone: string;
}

interface LocalParts {
  isoDate: string; // YYYY-MM-DD in the business timezone
  minutesOfDay: number; // minutes since local midnight
}

function toLocalParts(date: Date, timeZone: string): LocalParts {
  const { year, month, day, hour, minute } = zonedParts(date, timeZone);
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
  hours: BusinessClock,
  holidays: Set<string>
): boolean {
  const { isoDate, minutesOfDay } = toLocalParts(date, hours.timeZone);
  if (!isWorkingDay(localMidnightAsUtcDate(isoDate), holidays)) return false;
  return minutesOfDay >= timeToMinutes(hours.start) && minutesOfDay < timeToMinutes(hours.end);
}

// Returns the instant `date` if already within business hours, otherwise the
// next business-hours start (a working day's `hours.start`, in `hours.timeZone`).
export function nextBusinessHoursStart(
  date: Date,
  hours: BusinessClock,
  holidays: Set<string>
): Date {
  if (isWithinBusinessHours(date, hours, holidays)) return date;

  const { isoDate, minutesOfDay } = toLocalParts(date, hours.timeZone);
  const startMinutes = timeToMinutes(hours.start);

  // If today is a working day and we're before the window opens, today's start applies.
  if (isWorkingDay(localMidnightAsUtcDate(isoDate), holidays) && minutesOfDay < startMinutes) {
    return localWindowStart(isoDate, hours.start, hours.timeZone);
  }

  // Otherwise walk forward day by day until we hit a working day.
  let probe = localMidnightAsUtcDate(isoDate);
  do {
    probe = new Date(probe.getTime() + 24 * 60 * 60 * 1000);
  } while (!isWorkingDay(probe, holidays));

  return localWindowStart(probe.toISOString().slice(0, 10), hours.start, hours.timeZone);
}

// Business-hours start of the Nth working day after `date`'s local calendar
// day (walking forward, skipping weekends/holidays). Used for "N working
// days" delivery-delay presets (#66).
export function nthWorkingDayStart(
  date: Date,
  n: number,
  hours: BusinessClock,
  holidays: Set<string>
): Date {
  const { isoDate } = toLocalParts(date, hours.timeZone);
  const target = addWorkingDays(localMidnightAsUtcDate(isoDate), n, holidays);
  return localWindowStart(target.toISOString().slice(0, 10), hours.start, hours.timeZone);
}

// Builds the instant corresponding to `time` (HH:MM) on `isoDate` in `timeZone`.
function localWindowStart(isoDate: string, time: string, timeZone: string): Date {
  const [h, m] = time.split(":").map(Number);
  // Resolve the UTC offset for `timeZone` on this date by comparing a UTC
  // guess against how it renders locally, then correcting.
  const guessUtc = new Date(`${isoDate}T${time}:00.000Z`);
  const rendered = toLocalParts(guessUtc, timeZone);
  const renderedMinutes = rendered.minutesOfDay;
  const targetMinutes = h * 60 + m;
  let diffMinutes = targetMinutes - renderedMinutes;
  // Handle date-boundary wraparound when the local render lands on the adjacent day.
  if (rendered.isoDate < isoDate) diffMinutes += 24 * 60;
  else if (rendered.isoDate > isoDate) diffMinutes -= 24 * 60;
  return new Date(guessUtc.getTime() + diffMinutes * 60 * 1000);
}
