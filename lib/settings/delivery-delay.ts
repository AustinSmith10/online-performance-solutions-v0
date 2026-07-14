import type { SupabaseClient } from "@supabase/supabase-js";
import type { DelayDuration, DeliveryDelayDurations } from "@/lib/delivery/delivery-delay";

export const DEFAULT_DELIVERY_DELAY_DURATIONS: DeliveryDelayDurations = {
  normal: { unit: "workingDays", value: 1 },
  extended: { unit: "workingDays", value: 7 },
};

export const DELIVERY_DELAY_DURATIONS_KEY = "delivery_delay_durations";

function isValidDuration(value: unknown): value is DelayDuration {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<DelayDuration>;
  return (d.unit === "hours" || d.unit === "workingDays") && typeof d.value === "number" && d.value > 0;
}

export async function getDeliveryDelayDurations(
  supabase: SupabaseClient
): Promise<DeliveryDelayDurations> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", DELIVERY_DELAY_DURATIONS_KEY)
    .maybeSingle();

  const value = data?.value as Partial<DeliveryDelayDurations> | undefined;
  if (!isValidDuration(value?.normal) || !isValidDuration(value?.extended)) {
    return DEFAULT_DELIVERY_DELAY_DURATIONS;
  }
  return { normal: value.normal, extended: value.extended };
}

export async function setDeliveryDelayDurations(
  supabase: SupabaseClient,
  durations: DeliveryDelayDurations,
  updatedBy?: string | null
): Promise<{ error?: string }> {
  if (!isValidDuration(durations.normal)) {
    return { error: "Enter a valid normal delay." };
  }
  if (!isValidDuration(durations.extended)) {
    return { error: "Enter a valid extended delay." };
  }
  if (durations.normal.unit === "workingDays" && !Number.isInteger(durations.normal.value)) {
    return { error: "Working days must be a whole number." };
  }
  if (durations.extended.unit === "workingDays" && !Number.isInteger(durations.extended.value)) {
    return { error: "Working days must be a whole number." };
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
