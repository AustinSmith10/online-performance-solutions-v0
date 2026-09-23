import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import { addWorkingDays } from "@/lib/delivery/working-days";
import { getBusinessTimezone } from "@/lib/settings/timezone";
import { calendarDateAsUtc, calendarDateOf, isoDateInTz } from "@/lib/time";

/**
 * A project's expected delivery date (`YYYY-MM-DD`): `deliveryDays` working
 * days after today, where "today" is the calendar day in the business
 * timezone (#188). Walking from the raw instant instead stamped the UTC day,
 * which is yesterday for anything submitted before 10am AEST.
 */
export async function computeExpectedDeliveryDate(
  supabase: SupabaseClient,
  deliveryDays: number,
  stateTerritory: string | null,
  now: Date = new Date()
): Promise<string> {
  const timeZone = await getBusinessTimezone(supabase);
  const today = isoDateInTz(now, timeZone);
  const year = Number(today.slice(0, 4));
  const [holidaysA, holidaysB] = await Promise.all([
    getPublicHolidays(stateTerritory, year),
    getPublicHolidays(stateTerritory, year + 1),
  ]);
  const due = addWorkingDays(calendarDateAsUtc(today), deliveryDays, new Set([...holidaysA, ...holidaysB]));
  return calendarDateOf(due);
}
