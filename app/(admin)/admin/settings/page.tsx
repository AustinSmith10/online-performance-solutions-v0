import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getDigestSchedule } from "@/lib/settings/digest-schedule";
import { getBusinessHours } from "@/lib/settings/business-hours";
import { getDeliveryDelayDurations } from "@/lib/settings/delivery-delay";
import { getAdminNavRestrictions } from "@/lib/settings/admin-nav-restrictions";
import { getEmailsEnabled } from "@/lib/settings/emails-enabled";
import { getJudgeDocumentTextCharCap } from "@/lib/settings/judge-document-text-cap";
import { getExtractionDocumentTextCharCap } from "@/lib/settings/extraction-document-text-cap";
import { getAiExtractionEnabled } from "@/lib/settings/ai-extraction-enabled";
import { getExtractionDailyLimit } from "@/lib/settings/extraction-budget";
import { getBusinessTimezone } from "@/lib/settings/timezone";
import { DigestScheduleForm } from "./_components/DigestScheduleForm";
import { BusinessHoursForm } from "./_components/BusinessHoursForm";
import { DeliveryDelayDurationsForm } from "./_components/DeliveryDelayDurationsForm";
import { AdminNavRestrictionsForm } from "./_components/AdminNavRestrictionsForm";
import { EmailsEnabledForm } from "./_components/EmailsEnabledForm";
import { JudgeDocumentTextCapForm } from "./_components/JudgeDocumentTextCapForm";
import { ExtractionDocumentTextCapForm } from "./_components/ExtractionDocumentTextCapForm";
import { ExtractionDailyLimitForm } from "./_components/ExtractionDailyLimitForm";
import { AiExtractionEnabledForm } from "./_components/AiExtractionEnabledForm";
import { BusinessTimezoneForm } from "./_components/BusinessTimezoneForm";
import { SettingsSection } from "./_components/SettingsSection";

export default async function AdminSettingsPage() {
  const user = await requireRole("super_admin", "admin");

  const supabase = createAdminClient();
  const isSuperAdmin = user.role === "super_admin";
  // Ten independent settings reads: run together instead of one round trip each.
  const [
    schedule,
    businessHours,
    deliveryDelayDurations,
    judgeDocumentTextCap,
    extractionDocumentTextCap,
    extractionDailyLimit,
    navRestrictions,
    emailsEnabled,
    businessTimezone,
    aiExtractionEnabled,
  ] = await Promise.all([
    getDigestSchedule(supabase),
    getBusinessHours(supabase),
    getDeliveryDelayDurations(supabase),
    getJudgeDocumentTextCharCap(supabase),
    getExtractionDocumentTextCharCap(supabase),
    getExtractionDailyLimit(supabase),
    isSuperAdmin ? getAdminNavRestrictions(supabase) : Promise.resolve([]),
    isSuperAdmin ? getEmailsEnabled(supabase) : Promise.resolve(true),
    getBusinessTimezone(supabase),
    isSuperAdmin ? getAiExtractionEnabled(supabase) : Promise.resolve(true),
  ]);

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

      <SettingsSection
        title="Document processing"
        description="Limits on the AI calls made for uploaded documents. The AI extraction kill switch (super admin) turns all of them off."
      >
        <ExtractionDailyLimitForm limit={extractionDailyLimit} />
        <ExtractionDocumentTextCapForm cap={extractionDocumentTextCap} />
        <JudgeDocumentTextCapForm cap={judgeDocumentTextCap} />
      </SettingsSection>

      {user.role === "super_admin" && (
        <SettingsSection
          title="Timezone"
          description="The clock that business hours and scheduled sends run on. Super admin only."
        >
          <BusinessTimezoneForm timeZone={businessTimezone} />
        </SettingsSection>
      )}

      {user.role === "super_admin" && (
        <SettingsSection
          title="Access control"
          description="Choose which admin navigation items regular admins can see. Super admin only."
        >
          <AdminNavRestrictionsForm restricted={navRestrictions} />
        </SettingsSection>
      )}

      {user.role === "super_admin" && (
        <SettingsSection
          title="Email delivery"
          description="A platform-wide switch for outbound email. Super admin only."
        >
          <EmailsEnabledForm enabled={emailsEnabled} />
        </SettingsSection>
      )}

      {user.role === "super_admin" && (
        <SettingsSection
          title="AI extraction"
          description="A platform-wide switch for AI document extraction. Super admin only."
        >
          <AiExtractionEnabledForm enabled={aiExtractionEnabled} />
        </SettingsSection>
      )}
    </div>
  );
}
