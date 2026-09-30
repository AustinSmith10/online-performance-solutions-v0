import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEmailQueueRows } from "@/lib/email-queue/load-rows";
import { EmailQueueClient } from "@/components/email-queue/EmailQueueClient";

export default async function ConsultantEmailQueuePage() {
  const supabase = createAdminClient();
  // The role check and the queue don't depend on each other: one round trip.
  const [, rows] = await Promise.all([requireRole("consultant"), loadEmailQueueRows(supabase)]);

  return <EmailQueueClient rows={rows} />;
}
