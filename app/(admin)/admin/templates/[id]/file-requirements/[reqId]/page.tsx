import { BackLink } from "@/components/BackLink";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { EditForm } from "./_components/EditForm";

export default async function EditFileRequirementPage({
  params,
}: {
  params: Promise<{ id: string; reqId: string }>;
}) {
  await requireRole("super_admin", "admin");
  const { id: templateId, reqId } = await params;

  const supabase = createAdminClient();

  const [{ data: tmpl }, { data: req }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, name")
      .eq("id", templateId)
      .maybeSingle(),
    supabase
      .from("file_requirements")
      .select(
        "id, name, slug, max_count, required, no_duplicates, extraction, template_id, marker_text_patterns, marker_page_count_min, marker_page_count_max, marker_regex, ai_judge_hint, reference_sample_storage_path"
      )
      .eq("id", reqId)
      .eq("template_id", templateId)
      .maybeSingle(),
  ]);

  if (!tmpl || !req) notFound();

  // Reference sample preview (#115) needs a fresh signed URL per render —
  // the storage path alone isn't fetchable from the browser (private bucket).
  const referenceSampleSignedUrl = req.reference_sample_storage_path
    ? (
        await supabase.storage
          .from("templates")
          .createSignedUrl(req.reference_sample_storage_path as string, 3600)
      ).data?.signedUrl ?? null
    : null;

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <BackLink href={`/admin/templates/${templateId}`}>{tmpl.name}</BackLink>

      <div className="rounded-xl border border-zinc-200 bg-white p-5">
        <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit File Requirement</h1>
        <EditForm
          templateId={templateId}
          requirement={req}
          referenceSampleSignedUrl={referenceSampleSignedUrl}
        />
      </div>
    </div>
  );
}
