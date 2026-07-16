import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitOnBehalfForm } from "@/components/workspace/SubmitOnBehalfForm";

type FileRequirement = {
  id: string;
  name: string;
  slug: string;
  max_count: number;
  required: boolean;
  no_duplicates: boolean;
  extraction: boolean;
  template_id: string;
};

function stakeholderName(row: { first_name: string | null; last_name: string | null; email: string }) {
  return [row.first_name, row.last_name].filter(Boolean).join(" ") || row.email;
}

export default async function ConsultantSubmitPage() {
  await requireRole("consultant");
  const supabase = createAdminClient();

  const { data: orgs } = await supabase
    .from("clients")
    .select("id, name")
    .is("deleted_at", null)
    .order("name");

  const clients = (orgs ?? []) as { id: string; name: string }[];
  const clientIds = clients.map((c) => c.id);

  const [{ data: stakeholderRows }, { data: templateRows }] = clientIds.length
    ? await Promise.all([
        supabase
          .from("users")
          .select("id, first_name, last_name, email, client_id")
          .in("client_id", clientIds)
          .eq("role", "stakeholder")
          .order("first_name")
          .order("last_name"),
        supabase
          .from("templates")
          .select("id, name, client_id")
          .in("client_id", clientIds)
          .eq("status", "active")
          .is("deleted_at", null)
          .order("name"),
      ])
    : [{ data: [] }, { data: [] }];

  const stakeholdersByClient: Record<string, { id: string; name: string; email: string }[]> = {};
  for (const row of (stakeholderRows ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string; client_id: string }[]) {
    (stakeholdersByClient[row.client_id] ??= []).push({ id: row.id, name: stakeholderName(row), email: row.email });
  }

  const templatesByClient: Record<string, { id: string; name: string }[]> = {};
  const allTemplateIds: string[] = [];
  for (const row of (templateRows ?? []) as { id: string; name: string; client_id: string }[]) {
    (templatesByClient[row.client_id] ??= []).push({ id: row.id, name: row.name });
    allTemplateIds.push(row.id);
  }

  const { data: reqRows } = allTemplateIds.length
    ? await supabase
        .from("file_requirements")
        .select("id, name, slug, max_count, required, no_duplicates, extraction, template_id")
        .in("template_id", allTemplateIds)
        .order("sort_order", { ascending: true })
    : { data: [] };

  const requirementsByTemplate: Record<string, FileRequirement[]> = {};
  for (const req of (reqRows ?? []) as FileRequirement[]) {
    (requirementsByTemplate[req.template_id] ??= []).push(req);
  }

  return (
    <SubmitOnBehalfForm
      mode="consultant"
      clients={clients}
      stakeholdersByClient={stakeholdersByClient}
      templatesByClient={templatesByClient}
      requirementsByTemplate={requirementsByTemplate}
      projectBasePath="/ops/projects"
      backHref="/ops"
      backLabel="← My projects"
      submitPath="/ops/projects/submit"
    />
  );
}
