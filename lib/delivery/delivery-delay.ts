import { isWithinBusinessHours, nextBusinessHoursStart, type BusinessHours } from "./business-hours";

export type DeliveryDelayPreset = "expedited" | "normal" | "extended";

export const DELIVERY_DELAY_PRESETS: DeliveryDelayPreset[] = ["expedited", "normal", "extended"];

export interface DeliveryDelayDurations {
  normalHours: number;
  extendedHours: number;
}

function delayHoursFor(preset: DeliveryDelayPreset, durations: DeliveryDelayDurations): number {
  if (preset === "expedited") return 0;
  return preset === "normal" ? durations.normalHours : durations.extendedHours;
}

// Effective delivery time = max(now + preset delay, next business-hours window) (#66).
// Expedited has no delay, so this reduces to the #63 business-hours gating alone.
export function computeEffectiveDeliveryTime(
  now: Date,
  preset: DeliveryDelayPreset,
  durations: DeliveryDelayDurations,
  businessHours: BusinessHours,
  holidays: Set<string>
): Date {
  const delayHours = delayHoursFor(preset, durations);
  const candidate = new Date(now.getTime() + delayHours * 60 * 60 * 1000);

  if (isWithinBusinessHours(candidate, businessHours, holidays)) return candidate;
  return nextBusinessHoursStart(candidate, businessHours, holidays);
}
