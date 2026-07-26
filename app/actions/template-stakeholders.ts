"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";

// ─── Template required-reviewer management ───────────────────────────────────
// Which of the client's org-roster stakeholders must always be added as a
// reviewer on any project built from this template (e.g. Stockland's
// certifier). Locked at the project level — added here, never removable
// per-project.

export async function addTemplateStakeholder(
  templateId: string,
  stakeholderId: string
): Promise<void> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("template_stakeholders")
    .upsert(
      { template_id: templateId, stakeholder_id: stakeholderId },
      { onConflict: "template_id,stakeholder_id", ignoreDuplicates: true }
    );
  if (error) {
    console.error(`[addTemplateStakeholder] failed:`, error);
    return;
  }

  await auditLog("template.required_reviewer_added", actor.id, actor.email as string, {
    metadata: { templateId, stakeholderId },
  });

  revalidatePath(`/admin/templates/${templateId}`);
}

export async function removeTemplateStakeholder(
  templateId: string,
  stakeholderId: string
): Promise<void> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  await supabase
    .from("template_stakeholders")
    .delete()
    .eq("template_id", templateId)
    .eq("stakeholder_id", stakeholderId);

  await auditLog("template.required_reviewer_removed", actor.id, actor.email as string, {
    metadata: { templateId, stakeholderId },
  });

  revalidatePath(`/admin/templates/${templateId}`);
}
