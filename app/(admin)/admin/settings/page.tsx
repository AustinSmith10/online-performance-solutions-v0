import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDigestSchedule } from "@/lib/settings/digest-schedule";
import { getBusinessHours } from "@/lib/settings/business-hours";
import { getDeliveryDelayDurations } from "@/lib/settings/delivery-delay";
import { getAdminNavRestrictions } from "@/lib/settings/admin-nav-restrictions";
import { DigestScheduleForm } from "./_components/DigestScheduleForm";
import { BusinessHoursForm } from "./_components/BusinessHoursForm";
import { DeliveryDelayDurationsForm } from "./_components/DeliveryDelayDurationsForm";
import { AdminNavRestrictionsForm } from "./_components/AdminNavRestrictionsForm";
import { SettingsSection } from "./_components/SettingsSection";

export default async function AdminSettingsPage() {
  const user = await requireRole("super_admin", "admin");

  const supabase = createAdminClient();
  const schedule = await getDigestSchedule(supabase);
  const businessHours = await getBusinessHours(supabase);
  const deliveryDelayDurations = await getDeliveryDelayDurations(supabase);
  const navRestrictions =
    user.role === "super_admin" ? await getAdminNavRestrictions(supabase) : [];

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Platform-wide configuration.</p>
      </div>

      <SettingsSection
        title="Notifications"
        description="Automated emails sent to consultants and admins."
      >
        <DigestScheduleForm schedule={schedule} />
      </SettingsSection>

      <SettingsSection
        title="Delivery"
        description="Timing rules for automated status updates and report generation."
      >
        <BusinessHoursForm hours={businessHours} />
        <DeliveryDelayDurationsForm durations={deliveryDelayDurations} />
      </SettingsSection>

      {user.role === "super_admin" && (
        <SettingsSection title="Access control" description="Super admin only.">
          <AdminNavRestrictionsForm restricted={navRestrictions} />
        </SettingsSection>
      )}
    </div>
  );
}
