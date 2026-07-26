import { createAdminClient } from "@/lib/supabase/admin";

interface StakeholderRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

// Reviewers for a project = the template's required roster subset (locked,
// never removable per-project) union any project-scope one-off extras added
// on top. There is no org-wide fallback — an org's roster is only ever a
// pick-list, not something that auto-applies to every project regardless of
// template.
export async function resolveStakeholders(
  projectId: string,
  templateId: string | null
): Promise<StakeholderRow[]> {
  const supabase = createAdminClient();

  const [templateRequiredResult, projectExtrasResult] = await Promise.all([
    templateId
      ? supabase
          .from("template_stakeholders")
          .select("stakeholders(id, name, email, company, is_active, deleted_at)")
          .eq("template_id", templateId)
      : Promise.resolve({ data: [] as { stakeholders: unknown }[] }),
    supabase
      .from("stakeholders")
      .select("id, name, email, company")
      .eq("scope", "project")
      .eq("scope_id", projectId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
  ]);

  const templateRequired = ((templateRequiredResult.data ?? []) as { stakeholders: StakeholderRow & { is_active: boolean; deleted_at: string | null } | null }[])
    .map((row) => row.stakeholders)
    .filter((s): s is StakeholderRow & { is_active: boolean; deleted_at: string | null } => !!s && s.is_active && !s.deleted_at)
    .map(({ id, name, email, company }) => ({ id, name, email, company }));

  const projectExtras = (projectExtrasResult.data ?? []) as StakeholderRow[];

  const combined = [...templateRequired];
  const seenEmails = new Set(combined.map((s) => s.email.toLowerCase()));
  for (const extra of projectExtras) {
    const key = extra.email.toLowerCase();
    if (seenEmails.has(key)) continue;
    seenEmails.add(key);
    combined.push(extra);
  }

  return combined;
}
