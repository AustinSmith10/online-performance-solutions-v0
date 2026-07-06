import type { PgBoss } from "pg-boss";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDigestSchedule, timeToCron } from "@/lib/settings/digest-schedule";

export const AVAILABLE_REQUESTS_DIGEST_QUEUE = "available-requests-digest";

export async function reconcileDigestSchedule(
  boss: Pick<PgBoss, "schedule">,
  supabase: SupabaseClient
): Promise<void> {
  const schedule = await getDigestSchedule(supabase);

  await boss.schedule(
    AVAILABLE_REQUESTS_DIGEST_QUEUE,
    timeToCron(schedule.morning),
    {},
    { key: "morning" }
  );
  await boss.schedule(
    AVAILABLE_REQUESTS_DIGEST_QUEUE,
    timeToCron(schedule.afternoon),
    {},
    { key: "afternoon" }
  );
}
