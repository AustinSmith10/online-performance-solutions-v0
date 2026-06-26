import { notFound } from "next/navigation";
import Link from "next/link";
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
      .select("id, name, slug, max_count, required, no_duplicates, extraction, template_id")
      .eq("id", reqId)
      .eq("template_id", templateId)
      .maybeSingle(),
  ]);

  if (!tmpl || !req) notFound();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-sm text-zinc-500">
        <Link href="/admin/templates" className="hover:text-zinc-700">Templates</Link>
        <span className="mx-1">›</span>
        <Link href={`/admin/templates/${templateId}`} className="hover:text-zinc-700">
          {tmpl.name}
        </Link>
        <span className="mx-1">›</span>
        <span className="text-zinc-700">Edit requirement</span>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <h1 className="mb-6 text-lg font-semibold text-zinc-900">Edit File Requirement</h1>
        <EditForm templateId={templateId} requirement={req} />
      </div>
    </div>
  );
}
