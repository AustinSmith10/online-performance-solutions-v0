import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import { computeEffectiveDeliveryTime, type DeliveryDelayPreset } from "@/lib/delivery/delivery-delay";
import { isWithinBusinessHours, nextBusinessHoursStart } from "@/lib/delivery/business-hours";
import { getBusinessHours } from "@/lib/settings/business-hours";
import { getDeliveryDelayDurations } from "@/lib/settings/delivery-delay";
import { deliverPbdr } from "@/lib/documents/delivery";
import { dispatchPbdb } from "@/lib/stakeholders/dispatch";

export interface ScheduleOrDeliverResult {
  delivered: boolean;
  scheduledFor: string | null;
}

// Explicit-trigger PBDR delivery (admin/consultant clicks Convert, having
// already picked the project's delivery delay preset), gated to business
// hours (#63) and that preset (#66). Effective delivery time is the later of
// "now + preset delay" and the next business-hours window. Expedited has no
// delay, so it reduces to delivering immediately if within business hours,
// otherwise staging for the next window. Normal/Extended push the time out
// further, staging in `pending_deliveries` for a worker cron to pick up.
export async function scheduleOrDeliverPbdr(
  projectId: string,
  actorId: string | null = null,
  actorEmail: string | null = null
): Promise<ScheduleOrDeliverResult> {
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
    const result = await deliverPbdr(projectId, actorId, actorEmail);
    if (!result.success) throw new Error(result.reason ?? "Conversion failed.");
    return { delivered: true, scheduledFor: null };
  }

  const { error } = await supabase.from("pending_deliveries").upsert(
    {
      project_id: projectId,
      delivery_type: "pbdr",
      scheduled_for: effectiveDeliveryTime.toISOString(),
    },
    { onConflict: "project_id,delivery_type" }
  );

  if (error) {
    console.error(`[scheduleOrDeliverPbdr] failed to stage delivery for ${projectId}:`, error);
    throw error;
  }

  return { delivered: false, scheduledFor: effectiveDeliveryTime.toISOString() };
}

// Mirrors scheduleOrDeliverPbdr, but for the initial PBDB dispatch to
// stakeholders (#110). Uses the project's independent
// pbdb_delivery_delay_preset — never the PBDR preset — and stages via the
// same pending_deliveries table, discriminated by delivery_type. This is
// project-level/batch scheduling: every stakeholder in a single PBDB
// dispatch shares one delayed time, never staggered per-stakeholder.
export async function scheduleOrDeliverPbdb(
  projectId: string,
  actorId: string,
  _actorEmail: string | null = null
): Promise<ScheduleOrDeliverResult> {
  const supabase = createAdminClient();
  const now = new Date();

  const { data: project } = await supabase
    .from("projects")
    .select("client_id, pbdb_delivery_delay_preset, clients(state_territory)")
    .eq("id", projectId)
    .single();

  const stateTerritory =
    (project?.clients as unknown as { state_territory: string | null } | null)
      ?.state_territory ?? null;
  const preset = (project?.pbdb_delivery_delay_preset ?? "normal") as DeliveryDelayPreset;

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
    await dispatchPbdb(projectId, actorId);
    return { delivered: true, scheduledFor: null };
  }

  const { error } = await supabase.from("pending_deliveries").upsert(
    {
      project_id: projectId,
      delivery_type: "pbdb",
      scheduled_for: effectiveDeliveryTime.toISOString(),
    },
    { onConflict: "project_id,delivery_type" }
  );

  if (error) {
    console.error(`[scheduleOrDeliverPbdb] failed to stage delivery for ${projectId}:`, error);
    throw error;
  }

  return { delivered: false, scheduledFor: effectiveDeliveryTime.toISOString() };
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
    await supabase
      .from("pending_deliveries")
      .delete()
      .eq("project_id", projectId)
      .eq("delivery_type", "pbdr");
    const result = await deliverPbdr(projectId, actorId, actorEmail);
    return { delivered: result.success, scheduledFor: null, reason: result.reason };
  }

  const { error } = await supabase.from("pending_deliveries").upsert(
    {
      project_id: projectId,
      delivery_type: "pbdr",
      scheduled_for: target.toISOString(),
    },
    { onConflict: "project_id,delivery_type" }
  );

  if (error) {
    console.error(`[expediteDelivery] failed to reschedule delivery for ${projectId}:`, error);
    throw error;
  }

  return { delivered: false, scheduledFor: target.toISOString() };
}
