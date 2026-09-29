"use client";

import { updateAiExtractionEnabledAction } from "@/app/actions/settings";
import { KillSwitchForm } from "./KillSwitchForm";

export function AiExtractionEnabledForm({ enabled }: { enabled: boolean }) {
  return (
    <KillSwitchForm
      title="AI extraction"
      description="When off, AI-based document field extraction stops (no Anthropic calls). Uploads still succeed; extracted fields come back empty for review to fill in manually."
      enabled={enabled}
      checkboxLabel="Run AI document extraction"
      offWarning="New uploads will have no AI-extracted fields until you turn this back on. Consultants will fill every field in by hand."
      savedMessage="AI extraction setting updated."
      action={updateAiExtractionEnabledAction}
    />
  );
}
