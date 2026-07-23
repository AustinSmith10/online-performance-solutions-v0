import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadEmailQueueRows } from "@/lib/email-queue/load-rows";
import { EmailQueueClient } from "@/components/email-queue/EmailQueueClient";

export default async function ConsultantEmailQueuePage() {
  await requireRole("consultant");
  const supabase = createAdminClient();
  const rows = await loadEmailQueueRows(supabase);

  return <EmailQueueClient rows={rows} />;
}
