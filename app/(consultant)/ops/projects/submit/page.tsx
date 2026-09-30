import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmitOnBehalfForm } from "@/components/workspace/SubmitOnBehalfForm";
import { getTagsByUserId } from "@/lib/tags/queries";
import type { TagChipData } from "@/components/TagChip";

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
  const supabase = createAdminClient();

  // The caller check, the client list, and the stakeholder/template lists are
  // independent: one round trip. The stakeholder/template queries are not
  // filtered by client id up front (that filter is only "clients that aren't
  // deleted"), so rows belonging to deleted clients are dropped below instead.
  const [, { data: orgs }, { data: allStakeholderRows }, { data: allTemplateRows }] = await Promise.all([
    requireRole("consultant"),
    supabase.from("clients").select("id, name").is("deleted_at", null).order("name"),
    supabase
      .from("users")
      .select("id, first_name, last_name, email, client_id")
      .not("client_id", "is", null)
      .eq("role", "stakeholder")
      .order("first_name")
      .order("last_name"),
    supabase
      .from("templates")
      .select("id, name, client_id")
      .eq("status", "active")
      .is("deleted_at", null)
      .order("name"),
  ]);

  const clients = (orgs ?? []) as { id: string; name: string }[];
  const liveClientIds = new Set(clients.map((c) => c.id));
  const stakeholderRows = ((allStakeholderRows ?? []) as { id: string; first_name: string | null; last_name: string | null; email: string; client_id: string }[]).filter(
    (r) => liveClientIds.has(r.client_id)
  );
  const templateRows = ((allTemplateRows ?? []) as { id: string; name: string; client_id: string }[]).filter(
    (r) => liveClientIds.has(r.client_id)
  );
  const allTemplateIds = templateRows.map((r) => r.id);

  // Internal roles only (this page is staff-gated): tags render as chips
  // beside the name in the stakeholder dropdown (#213). Independent of the
  // requirements lookup, so both run together.
  const [tagsByUser, { data: reqRows }] = await Promise.all([
    getTagsByUserId(
      supabase,
      stakeholderRows.map((r) => r.id)
    ),
    allTemplateIds.length
      ? supabase
          .from("file_requirements")
          .select("id, name, slug, max_count, required, no_duplicates, extraction, template_id")
          .in("template_id", allTemplateIds)
          .order("sort_order", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const stakeholdersByClient: Record<string, { id: string; name: string; email: string; tags: TagChipData[] }[]> = {};
  for (const row of stakeholderRows) {
    (stakeholdersByClient[row.client_id] ??= []).push({
      id: row.id,
      name: stakeholderName(row),
      email: row.email,
      tags: tagsByUser.get(row.id) ?? [],
    });
  }

  const templatesByClient: Record<string, { id: string; name: string }[]> = {};
  for (const row of templateRows) {
    (templatesByClient[row.client_id] ??= []).push({ id: row.id, name: row.name });
  }

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
      backLabel="My projects"
      submitPath="/ops/projects/submit"
    />
  );
}
