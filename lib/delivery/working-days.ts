export function addWorkingDays(startDate: Date, workingDays: number, holidays: Set<string>): Date {
  const current = new Date(startDate);
  let remaining = workingDays;

  while (remaining > 0) {
    current.setUTCDate(current.getUTCDate() + 1);
    const dow = current.getUTCDay(); // 0=Sun, 6=Sat
    if (dow === 0 || dow === 6) continue;
    const iso = current.toISOString().slice(0, 10);
    if (holidays.has(iso)) continue;
    remaining--;
  }

  return current;
}
