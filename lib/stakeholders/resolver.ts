import { createAdminClient } from "@/lib/supabase/admin";

interface StakeholderRow {
  id: string;
  name: string;
  email: string;
  company: string | null;
}

// Resolution order: project → org.
// The first scope that has active stakeholders wins.
export async function resolveStakeholders(
  projectId: string,
  orgId: string
): Promise<StakeholderRow[]> {
  const supabase = createAdminClient();

  const { data: projectRows } = await supabase
    .from("stakeholders")
    .select("id, name, email, company")
    .eq("scope", "project")
    .eq("scope_id", projectId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  if (projectRows && projectRows.length > 0) {
    return projectRows as StakeholderRow[];
  }

  const { data: orgRows } = await supabase
    .from("stakeholders")
    .select("id, name, email, company")
    .eq("scope", "org")
    .eq("scope_id", orgId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order", { ascending: true });

  return (orgRows as StakeholderRow[]) ?? [];
}
