import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryDelayDurations } from "@/lib/delivery/delivery-delay";

export const DEFAULT_DELIVERY_DELAY_DURATIONS: DeliveryDelayDurations = {
  normalHours: 24,
  extendedHours: 72,
};

export const DELIVERY_DELAY_DURATIONS_KEY = "delivery_delay_durations";

export async function getDeliveryDelayDurations(
  supabase: SupabaseClient
): Promise<DeliveryDelayDurations> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", DELIVERY_DELAY_DURATIONS_KEY)
    .maybeSingle();

  const value = data?.value as Partial<DeliveryDelayDurations> | undefined;
  if (typeof value?.normalHours !== "number" || typeof value?.extendedHours !== "number") {
    return DEFAULT_DELIVERY_DELAY_DURATIONS;
  }
  return { normalHours: value.normalHours, extendedHours: value.extendedHours };
}

export async function setDeliveryDelayDurations(
  supabase: SupabaseClient,
  durations: DeliveryDelayDurations,
  updatedBy?: string | null
): Promise<{ error?: string }> {
  if (!Number.isFinite(durations.normalHours) || durations.normalHours < 0) {
    return { error: "Normal delay must be a non-negative number of hours." };
  }
  if (!Number.isFinite(durations.extendedHours) || durations.extendedHours < 0) {
    return { error: "Extended delay must be a non-negative number of hours." };
  }
  if (durations.extendedHours < durations.normalHours) {
    return { error: "Extended delay must be at least as long as the normal delay." };
  }

  const { error } = await supabase.from("app_settings").upsert({
    key: DELIVERY_DELAY_DURATIONS_KEY,
    value: durations,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? null,
  });

  if (error) return { error: error.message };
  return {};
}
