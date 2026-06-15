import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { SubmissionForm } from "./_components/SubmissionForm";

export default async function SubmitPage() {
  const user = await requireRole("client");
  const supabase = createAdminClient();

  const orgId = user.org_id as string;

  // Load active templates for this org
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

  const defaultTemplateId = activeTemplates.length === 1 ? activeTemplates[0].id : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-zinc-900">New report request</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload your purchase order and building plans. We'll extract the details automatically.
        </p>
      </div>
      <SubmissionForm
        templates={activeTemplates}
        defaultTemplateId={defaultTemplateId}
      />
    </div>
  );
}
