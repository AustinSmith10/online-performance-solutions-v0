// True if `date` falls on a weekday (UTC calendar) that isn't a public holiday.
export function isWorkingDay(date: Date, holidays: Set<string>): boolean {
  const dow = date.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  const iso = date.toISOString().slice(0, 10);
  return !holidays.has(iso);
}

export function addWorkingDays(startDate: Date, workingDays: number, holidays: Set<string>): Date {
  const current = new Date(startDate);
  let remaining = workingDays;

  while (remaining > 0) {
    current.setUTCDate(current.getUTCDate() + 1);
    if (!isWorkingDay(current, holidays)) continue;
    remaining--;
  }

  return current;
}
