import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDigestSchedule } from "@/lib/settings/digest-schedule";
import { DigestScheduleForm } from "./_components/DigestScheduleForm";

export default async function AdminSettingsPage() {
  await requireRole("super_admin", "admin");

  const supabase = createAdminClient();
  const schedule = await getDigestSchedule(supabase);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Platform-wide configuration.</p>
      </div>

      <DigestScheduleForm schedule={schedule} />
    </div>
  );
}
