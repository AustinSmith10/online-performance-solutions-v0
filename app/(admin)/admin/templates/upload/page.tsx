import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { UploadTemplateForm } from "./_components/upload-form";

export default async function UploadTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ client_id?: string }>;
}) {
  await requireRole("super_admin", "admin");
  const { client_id } = await searchParams;

  const supabase = createAdminClient();
  const { data: orgs } = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true });

  const orgList = (orgs ?? []) as { id: string; name: string }[];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/admin/templates" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Templates
        </Link>
        <h1 className="mt-2 text-xl font-semibold text-zinc-900">Upload template</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload a .docx file containing{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs">{"{TOKEN}"}</code>{" "}
          placeholders. OPS will extract all tokens and present a mapping table.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-6">
        <UploadTemplateForm orgs={orgList} defaultOrgId={client_id} />
      </div>
    </div>
  );
}
