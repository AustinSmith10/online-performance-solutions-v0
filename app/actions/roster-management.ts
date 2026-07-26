"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { inviteLateStakeholder } from "@/lib/stakeholders/late-add";
import type { StakeholderActionState } from "@/app/actions/stakeholders";

// Soft-deletes an org-scope reviewer roster entry, unless it's still
// required by a template or linked to a document token — those references
// must be removed first so nothing silently breaks.
export async function removeOrgStakeholder(
  orgId: string,
  stakeholderId: string,
  _prevState: StakeholderActionState,
  _formData: FormData
): Promise<StakeholderActionState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: stakeholder } = await supabase
    .from("stakeholders")
    .select("name, email")
    .eq("id", stakeholderId)
    .eq("scope", "org")
    .eq("scope_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!stakeholder) return {};

  const [{ data: requiredBy }, { data: linkedTokens }] = await Promise.all([
    supabase.from("template_stakeholders").select("templates(name)").eq("stakeholder_id", stakeholderId),
    supabase.from("client_config_token_links").select("token").eq("stakeholder_id", stakeholderId),
  ]);

  const templateNames =
    requiredBy
      ?.flatMap((r) => (r.templates as { name: string }[] | null) ?? [])
      .map((t) => t.name)
      .filter((n): n is string => !!n) ?? [];
  const tokenNames = (linkedTokens ?? []).map((r) => `{${r.token as string}}`);

  if (templateNames.length > 0 || tokenNames.length > 0) {
    const parts: string[] = [];
    if (templateNames.length > 0) parts.push(`required by ${templateNames.join(", ")}`);
    if (tokenNames.length > 0) parts.push(`linked to ${tokenNames.join(", ")}`);
    return {
      error: `Can't remove — ${parts.join("; ")}. Unlink it there first.`,
    };
  }

  await supabase
    .from("stakeholders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", stakeholderId);

  await auditLog("stakeholder.soft_deleted", actor.id, actor.email as string, {
    orgId,
    metadata: { stakeholderId, name: stakeholder.name, email: stakeholder.email },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/admin/recovery");
  return { saved: true };
}

// Adds a project-scope one-off reviewer copied from the client's org roster.
// If the project's current review cycle has already been dispatched, this
// immediately invites them (own stakeholder_reviews row + email/token) so
// the PBDR-conversion gate waits on them too.
export async function addProjectStakeholderFromRoster(
  projectId: string,
  _prevState: StakeholderActionState,
  formData: FormData
): Promise<StakeholderActionState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const rosterStakeholderId = formData.get("stakeholderId") as string | null;
  if (!rosterStakeholderId) return { error: "Select a reviewer." };

  const { data: rosterEntry } = await supabase
    .from("stakeholders")
    .select("name, email, company")
    .eq("id", rosterStakeholderId)
    .eq("scope", "org")
    .is("deleted_at", null)
    .maybeSingle();

  if (!rosterEntry) return { error: "Roster entry not found." };

  const name = rosterEntry.name as string;
  const email = (rosterEntry.email as string).toLowerCase();
  const company = rosterEntry.company as string | null;

  const { data: existing } = await supabase
    .from("stakeholders")
    .select("id")
    .eq("scope", "project")
    .eq("scope_id", projectId)
    .ilike("email", email)
    .maybeSingle();
  if (existing) return { error: "Already added to this project." };

  const { data: last } = await supabase
    .from("stakeholders")
    .select("sort_order")
    .eq("scope", "project")
    .eq("scope_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last?.sort_order as number | null) ?? -1) + 1;

  const { error } = await supabase.from("stakeholders").insert({
    scope: "project",
    scope_id: projectId,
    name,
    email,
    company,
    sort_order: sortOrder,
  });
  if (error) return { error: error.message };

  await inviteLateStakeholder(projectId, { name, email }, actor.id).catch((err) => {
    console.error(`[addProjectStakeholderFromRoster] late-add invite failed for ${email}:`, err);
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { saved: true };
}
