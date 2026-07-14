import {
  isWithinBusinessHours,
  nextBusinessHoursStart,
  nthWorkingDayStart,
  type BusinessHours,
} from "./business-hours";

export type DeliveryDelayPreset = "expedited" | "normal" | "extended";

export const DELIVERY_DELAY_PRESETS: DeliveryDelayPreset[] = ["expedited", "normal", "extended"];

export type DelayUnit = "hours" | "workingDays";

export interface DelayDuration {
  unit: DelayUnit;
  value: number;
}

export interface DeliveryDelayDurations {
  normal: DelayDuration;
  extended: DelayDuration;
}

export function formatDelayDuration(d: DelayDuration): string {
  return d.unit === "workingDays"
    ? `${d.value} working day${d.value === 1 ? "" : "s"}`
    : `${d.value} hour${d.value === 1 ? "" : "s"}`;
}

// Effective delivery time = max(now + preset delay, next business-hours window) (#66).
// Expedited has no delay, so this reduces to the #63 business-hours gating alone.
// A "working days" duration lands exactly on a business day's opening time, so
// it's already within business hours by construction — no extra rolling needed.
export function computeEffectiveDeliveryTime(
  now: Date,
  preset: DeliveryDelayPreset,
  durations: DeliveryDelayDurations,
  businessHours: BusinessHours,
  holidays: Set<string>
): Date {
  if (preset === "expedited") {
    return isWithinBusinessHours(now, businessHours, holidays)
      ? now
      : nextBusinessHoursStart(now, businessHours, holidays);
  }

  const duration = durations[preset];
  if (duration.unit === "workingDays") {
    return nthWorkingDayStart(now, duration.value, businessHours, holidays);
  }

  const candidate = new Date(now.getTime() + duration.value * 60 * 60 * 1000);
  return isWithinBusinessHours(candidate, businessHours, holidays)
    ? candidate
    : nextBusinessHoursStart(candidate, businessHours, holidays);
}
