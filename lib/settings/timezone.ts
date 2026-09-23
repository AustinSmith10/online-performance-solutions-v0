import type { SupabaseClient } from "@supabase/supabase-js";

export const BUSINESS_TIMEZONE_KEY = "business_timezone";

/**
 * The only zones a super admin can pick — this is an AU-only product
 * (state_territory codes, AU public holiday feed). Canberra is an IANA alias
 * of Sydney, listed separately because that's how people look for it.
 */
export const AU_TIMEZONES = [
  { value: "Australia/Brisbane", label: "Brisbane (AEST, no daylight saving)" },
  { value: "Australia/Sydney", label: "Sydney (AEST/AEDT)" },
  { value: "Australia/Melbourne", label: "Melbourne (AEST/AEDT)" },
  { value: "Australia/Canberra", label: "Canberra (AEST/AEDT)" },
  { value: "Australia/Hobart", label: "Hobart (AEST/AEDT)" },
  { value: "Australia/Adelaide", label: "Adelaide (ACST/ACDT)" },
  { value: "Australia/Darwin", label: "Darwin (ACST, no daylight saving)" },
  { value: "Australia/Perth", label: "Perth (AWST, no daylight saving)" },
] as const;

export type AuTimezone = (typeof AU_TIMEZONES)[number]["value"];

/** Used whenever the setting is unset or holds something unrecognised. */
export const DEFAULT_BUSINESS_TIMEZONE: AuTimezone = "Australia/Brisbane";

export function isAuTimezone(value: unknown): value is AuTimezone {
  return AU_TIMEZONES.some((tz) => tz.value === value);
}

/**
 * The single platform-wide business timezone (#187): business-hours gating,
 * scheduled-delivery display, and every server-stamped document / filename /
 * email / due date (#188) read it.
 */
export async function getBusinessTimezone(supabase: SupabaseClient): Promise<AuTimezone> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", BUSINESS_TIMEZONE_KEY)
    .maybeSingle();

  const value = (data?.value as { timeZone?: unknown } | undefined)?.timeZone;
  return isAuTimezone(value) ? value : DEFAULT_BUSINESS_TIMEZONE;
}

export async function setBusinessTimezone(
  supabase: SupabaseClient,
  timeZone: string,
  updatedBy?: string | null
): Promise<{ error?: string }> {
  if (!isAuTimezone(timeZone)) {
    return { error: "Choose an Australian timezone from the list." };
  }

  const { error } = await supabase.from("app_settings").upsert({
    key: BUSINESS_TIMEZONE_KEY,
    value: { timeZone },
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });

  if (error) return { error: error.message };
  return {};
}
