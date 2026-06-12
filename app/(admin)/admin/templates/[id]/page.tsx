import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { MappingTable } from "./_components/mapping-table";
import { TemplateStatusActions } from "./_components/status-actions";
import { DeleteButton } from "./_components/delete-button";
import { ReuploadForm } from "./_components/reupload-form";

type MappingRow = {
  id: string;
  placeholder_token: string;
  field_key: string | null;
  is_mapped: boolean;
};

type TemplateDetail = {
  id: string;
  name: string;
  status: string;
  storage_path: string;
  created_at: string;
  org: { id: string; name: string; org_config: Record<string, string> } | null;
};

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("super_admin");
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: tmpl }, { data: mappings }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, name, status, storage_path, created_at, org:org_id(id, name, org_config)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("template_field_mappings")
      .select("id, placeholder_token, field_key, is_mapped")
      .eq("template_id", id)
      .order("placeholder_token", { ascending: true }),
  ]);

  if (!tmpl) notFound();

  const template = tmpl as unknown as TemplateDetail;
  const rows = (mappings ?? []) as MappingRow[];

  const redFlags = rows.filter((r) => !r.is_mapped);
  const tokenSet = new Set(rows.map((r) => r.placeholder_token));
  const yellowFlags = Object.keys(template.org?.org_config ?? {}).filter(
    (key) => !tokenSet.has(key)
  );
  const canActivate = redFlags.length === 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <Link href="/admin/templates" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Templates
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">{template.name}</h1>
          <StatusBadge status={template.status} />
        </div>
        {template.org && (
          <p className="mt-1 text-sm text-zinc-500">
            <Link href={`/admin/organisations/${template.org.id}`} className="hover:underline">
              {template.org.name}
            </Link>
          </p>
        )}
      </div>

      {/* Validation banners */}
      {redFlags.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-semibold">{redFlags.length} token(s) with unrecognised prefix — </span>
          activation blocked. Tokens must start with{" "}
          <code className="rounded bg-red-100 px-1">CLIENT_</code>,{" "}
          <code className="rounded bg-red-100 px-1">EXTRACT_</code>,{" "}
          <code className="rounded bg-red-100 px-1">ORG_</code>,{" "}
          <code className="rounded bg-red-100 px-1">SYS_</code>, or{" "}
          <code className="rounded bg-red-100 px-1">PROJECT_</code>.
        </div>
      )}

      {yellowFlags.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">{yellowFlags.length} org config field(s) not present in template — </span>
          these will not be populated in generated documents.
        </div>
      )}

      {canActivate && yellowFlags.length === 0 && rows.length > 0 && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          All {rows.length} tokens recognised and all org fields present — template is ready to activate.
        </div>
      )}

      {canActivate && yellowFlags.length > 0 && rows.length > 0 && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          All {rows.length} tokens recognised — template can be activated (review missing org fields above).
        </div>
      )}

      {/* Status actions + danger zone */}
      <div className="flex items-center justify-between">
        <TemplateStatusActions
          templateId={id}
          status={template.status}
          canActivate={canActivate}
        />
        <DeleteButton templateId={id} />
      </div>

      {/* Re-upload */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Replace file</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Upload a new .docx to replace the current file. Tokens will be re-extracted and the
          template reset to draft.
        </p>
        <ReuploadForm templateId={id} />
      </div>

      {/* Token table */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">
            Tokens ({rows.length})
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Source is auto-detected from the token prefix. Unrecognised tokens block activation.
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">
            No placeholders found in this document.
          </p>
        ) : (
          <MappingTable rows={rows} missingOrgTokens={yellowFlags} />
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active:   "bg-green-100 text-green-700",
    inactive: "bg-zinc-100 text-zinc-500",
    draft:    "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-zinc-100 text-zinc-500"}`}>
      {status}
    </span>
  );
}
