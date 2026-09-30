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
import { SettingsTabs, type SettingsTabId } from "./_components/SettingsTabs";
import { TagManager } from "../tags/_components/TagManager";
import { listTags } from "@/lib/tags/queries";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireRole("super_admin", "admin");
  const { tab: tabParam } = await searchParams;

  const supabase = createAdminClient();
  const isSuperAdmin = user.role === "super_admin";

  // Tabs group the sections so the page isn't one long scroll. Admins see the
  // first two; the rest are super-admin only. An unknown or forbidden ?tab=
  // falls back to the first tab.
  const tabs: { id: SettingsTabId; label: string }[] = [
    { id: "delivery", label: "Notifications & delivery" },
    { id: "documents", label: "Documents & AI" },
    ...(isSuperAdmin
      ? ([
          { id: "platform", label: "Platform" },
          { id: "tags", label: "Tags" },
        ] as { id: SettingsTabId; label: string }[])
      : []),
  ];
  const active: SettingsTabId = tabs.some((t) => t.id === tabParam) ? (tabParam as SettingsTabId) : "delivery";

  // Only the active tab's data is read.
  let panel: React.ReactNode;
  if (active === "delivery") {
    const [schedule, businessHours, deliveryDelayDurations, businessTimezone] = await Promise.all([
      getDigestSchedule(supabase),
      getBusinessHours(supabase),
      getDeliveryDelayDurations(supabase),
      getBusinessTimezone(supabase),
    ]);
    panel = (
      <>
        <SettingsSection title="Notifications" description="Automated emails sent to consultants and admins.">
          <DigestScheduleForm schedule={schedule} />
        </SettingsSection>
        <SettingsSection
          title="Delivery"
          description="Timing rules for automated status updates and report generation."
        >
          <BusinessHoursForm hours={businessHours} />
          <DeliveryDelayDurationsForm durations={deliveryDelayDurations} />
        </SettingsSection>
        {isSuperAdmin && (
          <SettingsSection
            title="Timezone"
            description="The clock that business hours and scheduled sends run on. Super admin only."
          >
            <BusinessTimezoneForm timeZone={businessTimezone} />
          </SettingsSection>
        )}
      </>
    );
  } else if (active === "documents") {
    const [judgeDocumentTextCap, extractionDocumentTextCap, extractionDailyLimit, aiExtractionEnabled] =
      await Promise.all([
        getJudgeDocumentTextCharCap(supabase),
        getExtractionDocumentTextCharCap(supabase),
        getExtractionDailyLimit(supabase),
        isSuperAdmin ? getAiExtractionEnabled(supabase) : Promise.resolve(true),
      ]);
    panel = (
      <>
        <SettingsSection
          title="Document processing"
          description="Limits on the AI calls made for uploaded documents. The AI extraction kill switch (super admin) turns all of them off."
        >
          <ExtractionDailyLimitForm limit={extractionDailyLimit} />
          <ExtractionDocumentTextCapForm cap={extractionDocumentTextCap} />
          <JudgeDocumentTextCapForm cap={judgeDocumentTextCap} />
        </SettingsSection>
        {isSuperAdmin && (
          <SettingsSection
            title="AI extraction"
            description="A platform-wide switch for AI document extraction. Super admin only."
          >
            <AiExtractionEnabledForm enabled={aiExtractionEnabled} />
          </SettingsSection>
        )}
      </>
    );
  } else if (active === "platform") {
    const [navRestrictions, emailsEnabled] = await Promise.all([
      getAdminNavRestrictions(supabase),
      getEmailsEnabled(supabase),
    ]);
    panel = (
      <>
        <SettingsSection
          title="Access control"
          description="Choose which admin navigation items regular admins can see. Super admin only."
        >
          <AdminNavRestrictionsForm restricted={navRestrictions} />
        </SettingsSection>
        <SettingsSection
          title="Email delivery"
          description="A platform-wide switch for outbound email. Super admin only."
        >
          <EmailsEnabledForm enabled={emailsEnabled} />
        </SettingsSection>
      </>
    );
  } else {
    const [tags, { data: counts }] = await Promise.all([
      listTags(supabase),
      supabase.from("account_tags").select("tag_id"),
    ]);
    const usage = new Map<string, number>();
    for (const row of counts ?? []) usage.set(row.tag_id as string, (usage.get(row.tag_id as string) ?? 0) + 1);
    panel = (
      <SettingsSection
        title="Tags"
        description="Labels like Manager or VIP that sit beside an account's name for staff. Assign them from any user's page. Stakeholders never see tags, and they never appear in documents or emails. Super admin only."
      >
        <TagManager tags={tags.map((t) => ({ ...t, assignedCount: usage.get(t.id) ?? 0 }))} />
      </SettingsSection>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Platform-wide configuration.</p>
      </div>

      <SettingsTabs tabs={tabs} active={active} />

      <div key={active} role="tabpanel" id="settings-panel" aria-labelledby={`settings-tab-${active}`} className="pane-in space-y-8">
        {panel}
      </div>
    </div>
  );
}
