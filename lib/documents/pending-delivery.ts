import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import { isWithinBusinessHours, nextBusinessHoursStart } from "@/lib/delivery/business-hours";
import { getBusinessHours } from "@/lib/settings/business-hours";
import { deliverPbdr } from "@/lib/documents/delivery";

// Auto-triggered PBDR delivery, gated to business hours (#63). If `now` falls
// within the configured business-hours window, delivers immediately (today's
// behaviour, unchanged). Otherwise stages the delivery in `pending_deliveries`
// for a worker cron to pick up at the next business-hours window, so nothing
// becomes visible/notified until then.
export async function scheduleOrDeliverPbdr(projectId: string): Promise<void> {
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

  if (isWithinBusinessHours(now, businessHours, holidays)) {
    await deliverPbdr(projectId, null, null);
    return;
  }

  const scheduledFor = nextBusinessHoursStart(now, businessHours, holidays);
  const { error } = await supabase.from("pending_deliveries").upsert({
    project_id: projectId,
    scheduled_for: scheduledFor.toISOString(),
  });

  if (error) {
    console.error(`[scheduleOrDeliverPbdr] failed to stage delivery for ${projectId}:`, error);
    throw error;
  }
}
