import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import { computeEffectiveDeliveryTime, type DeliveryDelayPreset } from "@/lib/delivery/delivery-delay";
import { isWithinBusinessHours, nextBusinessHoursStart } from "@/lib/delivery/business-hours";
import { getBusinessHours } from "@/lib/settings/business-hours";
import { getDeliveryDelayDurations } from "@/lib/settings/delivery-delay";
import { deliverPbdr } from "@/lib/documents/delivery";

// Auto-triggered PBDR delivery, gated to business hours (#63) and the project's
// delivery delay preset (#66). Effective delivery time is the later of "now +
// preset delay" and the next business-hours window. Expedited has no delay, so
// it reduces to today's behaviour: deliver immediately if within business
// hours, otherwise stage for the next window. Normal/Extended push the time
// out further, staging in `pending_deliveries` for a worker cron to pick up.
export async function scheduleOrDeliverPbdr(projectId: string): Promise<void> {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: project } = await supabase
    .from("projects")
    .select("client_id, delivery_delay_preset, clients(state_territory)")
    .eq("id", projectId)
    .single();

  const stateTerritory =
    (project?.clients as unknown as { state_territory: string | null } | null)
      ?.state_territory ?? null;
  const preset = (project?.delivery_delay_preset ?? "normal") as DeliveryDelayPreset;

  const [businessHours, durations, holidaysThisYear, holidaysNextYear] = await Promise.all([
    getBusinessHours(supabase),
    getDeliveryDelayDurations(supabase),
    getPublicHolidays(stateTerritory, now.getUTCFullYear()),
    getPublicHolidays(stateTerritory, now.getUTCFullYear() + 1),
  ]);
  const holidays = new Set([...holidaysThisYear, ...holidaysNextYear]);

  const effectiveDeliveryTime = computeEffectiveDeliveryTime(
    now,
    preset,
    durations,
    businessHours,
    holidays
  );

  if (effectiveDeliveryTime.getTime() <= now.getTime()) {
    await deliverPbdr(projectId, null, null);
    return;
  }

  const { error } = await supabase.from("pending_deliveries").upsert({
    project_id: projectId,
    scheduled_for: effectiveDeliveryTime.toISOString(),
  });

  if (error) {
    console.error(`[scheduleOrDeliverPbdr] failed to stage delivery for ${projectId}:`, error);
    throw error;
  }
}

export interface ExpediteDeliveryResult {
  delivered: boolean;
  scheduledFor: string | null;
  reason?: string;
}

// Manual override: brings a staged delivery forward as if it were re-triggered
// right now with the "expedited" preset — i.e. the earliest business-hours
// window from this instant, not literally immediate (still gated by #63).
export async function expediteDelivery(
  projectId: string,
  actorId: string | null,
  actorEmail: string | null
): Promise<ExpediteDeliveryResult> {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: project } = await supabase
    .from("projects")
    .select("client_id, clients(state_territory)")
    .eq("id", projectId)
    .single();

  const stateTerritory =
    (project?.clients as unknown as { state_territory: string | null } | null)
      ?.state_territory ?? null;

  const [businessHours, holidaysThisYear, holidaysNextYear] = await Promise.all([
    getBusinessHours(supabase),
    getPublicHolidays(stateTerritory, now.getUTCFullYear()),
    getPublicHolidays(stateTerritory, now.getUTCFullYear() + 1),
  ]);
  const holidays = new Set([...holidaysThisYear, ...holidaysNextYear]);

  const target = isWithinBusinessHours(now, businessHours, holidays)
    ? now
    : nextBusinessHoursStart(now, businessHours, holidays);

  if (target.getTime() <= now.getTime()) {
    await supabase.from("pending_deliveries").delete().eq("project_id", projectId);
    const result = await deliverPbdr(projectId, actorId, actorEmail);
    return { delivered: result.success, scheduledFor: null, reason: result.reason };
  }

  const { error } = await supabase.from("pending_deliveries").upsert({
    project_id: projectId,
    scheduled_for: target.toISOString(),
  });

  if (error) {
    console.error(`[expediteDelivery] failed to reschedule delivery for ${projectId}:`, error);
    throw error;
  }

  return { delivered: false, scheduledFor: target.toISOString() };
}
