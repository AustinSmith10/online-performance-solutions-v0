import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { SubmissionForm } from "./_components/SubmissionForm";

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

export default async function SubmitPage() {
  const user = await requireRole("client");
  const supabase = createAdminClient();

  const orgId = user.org_id as string;

  const { data: templates } = await supabase
    .from("templates")
    .select("id, name")
    .eq("org_id", orgId)
    .eq("status", "active")
    .order("name");

  const activeTemplates = templates ?? [];

  if (activeTemplates.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-sm font-medium text-zinc-900">No report types available</p>
        <p className="mt-1 text-sm text-zinc-500">
          Contact your account manager to set up a report template before submitting.
        </p>
      </div>
    );
  }

  const templateIds = activeTemplates.map((t) => t.id);
  const { data: allRequirements } = await supabase
    .from("file_requirements")
    .select("id, name, slug, max_count, required, no_duplicates, extraction, template_id")
    .in("template_id", templateIds)
    .order("sort_order", { ascending: true });

  const requirementsByTemplate: Record<string, FileRequirement[]> = {};
  for (const req of (allRequirements ?? []) as FileRequirement[]) {
    if (!requirementsByTemplate[req.template_id]) {
      requirementsByTemplate[req.template_id] = [];
    }
    requirementsByTemplate[req.template_id].push(req);
  }

  const defaultTemplateId = activeTemplates.length === 1 ? activeTemplates[0].id : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-900">New report request</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload the required documents. We&apos;ll extract the details automatically.
        </p>
      </div>
      <SubmissionForm
        templates={activeTemplates}
        defaultTemplateId={defaultTemplateId}
        requirementsByTemplate={requirementsByTemplate}
      />
    </div>
  );
}
