import type { SupabaseClient } from "@supabase/supabase-js";

export interface DigestSchedule {
  morning: string;
  afternoon: string;
}

export const DEFAULT_DIGEST_SCHEDULE: DigestSchedule = {
  morning: "09:00",
  afternoon: "15:00",
};

export const DIGEST_SCHEDULE_KEY = "available_requests_digest_schedule";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(time: string): boolean {
  return TIME_RE.test(time);
}

export async function getDigestSchedule(
  supabase: SupabaseClient
): Promise<DigestSchedule> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", DIGEST_SCHEDULE_KEY)
    .maybeSingle();

  const value = data?.value as Partial<DigestSchedule> | undefined;
  if (!value?.morning || !value?.afternoon) return DEFAULT_DIGEST_SCHEDULE;
  return { morning: value.morning, afternoon: value.afternoon };
}

export async function setDigestSchedule(
  supabase: SupabaseClient,
  schedule: DigestSchedule,
  updatedBy?: string | null
): Promise<{ error?: string }> {
  if (!isValidTime(schedule.morning) || !isValidTime(schedule.afternoon)) {
    return { error: "Times must be in 24-hour HH:MM format." };
  }

  const { error } = await supabase.from("app_settings").upsert({
    key: DIGEST_SCHEDULE_KEY,
    value: schedule,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });

  if (error) return { error: error.message };
  return {};
}

export function timeToCron(time: string): string {
  const [hour, minute] = time.split(":").map(Number);
  return `${minute} ${hour} * * *`;
}
