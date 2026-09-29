"use client";

import { updateEmailsEnabledAction } from "@/app/actions/settings";
import { KillSwitchForm } from "./KillSwitchForm";

export function EmailsEnabledForm({ enabled }: { enabled: boolean }) {
  return (
    <KillSwitchForm
      title="Outbound emails"
      description="When off, no outbound email is sent to anyone. Attempted sends are still logged as failed in the delivery log."
      enabled={enabled}
      checkboxLabel="Send outbound emails"
      offWarning="This stops every outbound email platform-wide, including stakeholder approval requests and delivery notices, until you turn it back on."
      savedMessage="Email setting updated."
      action={updateEmailsEnabledAction}
    />
  );
}
