import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidTime } from "./digest-schedule";
import type { BusinessHours } from "@/lib/delivery/business-hours";

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  start: "09:00",
  end: "17:00",
};

export const BUSINESS_HOURS_KEY = "business_hours";

export async function getBusinessHours(supabase: SupabaseClient): Promise<BusinessHours> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", BUSINESS_HOURS_KEY)
    .maybeSingle();

  const value = data?.value as Partial<BusinessHours> | undefined;
  if (!value?.start || !value?.end) return DEFAULT_BUSINESS_HOURS;
  return { start: value.start, end: value.end };
}

export async function setBusinessHours(
  supabase: SupabaseClient,
  hours: BusinessHours,
  updatedBy?: string | null
): Promise<{ error?: string }> {
  if (!isValidTime(hours.start) || !isValidTime(hours.end)) {
    return { error: "Times must be in 24-hour HH:MM format." };
  }
  if (hours.start >= hours.end) {
    return { error: "Start time must be before end time." };
  }

  const { error } = await supabase.from("app_settings").upsert({
    key: BUSINESS_HOURS_KEY,
    value: hours,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });

  if (error) return { error: error.message };
  return {};
}
