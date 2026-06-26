import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { MappingTable } from "./_components/mapping-table";
import { TemplateStatusActions } from "./_components/status-actions";
import { DeleteButton } from "./_components/delete-button";
import { ReuploadForm } from "./_components/reupload-form";
import { AddExtractionTokenForm } from "./_components/add-extraction-token-form";
import { FileRequirementsSection } from "./_components/FileRequirementsSection";
import { SectionLabelsForm } from "./_components/SectionLabelsForm";

type MappingRow = {
  id: string;
  placeholder_token: string;
  field_key: string | null;
  is_mapped: boolean;
  in_template: boolean;
  display_label: string | null;
  extraction_hint: string | null;
  is_required: boolean;
  sort_order: number;
};

type TemplateDetail = {
  id: string;
  name: string;
  status: string;
  storage_path: string;
  created_at: string;
  section_labels: { extract: string; org: string; client: string };
  org: { id: string; name: string; org_config: Record<string, string> } | null;
};

export default async function TemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("super_admin", "admin");
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: tmpl }, { data: mappings }, { data: fileReqs }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, name, status, storage_path, created_at, section_labels, org:org_id(id, name, org_config)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("template_field_mappings")
      .select("id, placeholder_token, field_key, is_mapped, in_template, display_label, extraction_hint, is_required, sort_order")
      .eq("template_id", id)
      .order("sort_order", { ascending: true })
      .order("placeholder_token", { ascending: true }),
    supabase
      .from("file_requirements")
      .select("id, name, slug, max_count, required, no_duplicates, extraction")
      .eq("template_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  if (!tmpl) notFound();

  const template = tmpl as unknown as TemplateDetail;
  const rows = (mappings ?? []) as MappingRow[];
  const requirements = (fileReqs ?? []) as {
    id: string; name: string; slug: string;
    max_count: number; required: boolean; no_duplicates: boolean; extraction: boolean;
  }[];
  const templateRows = rows.filter((r) => r.in_template);
  const extractionOnlyRows = rows.filter((r) => !r.in_template);

  const redFlags = rows.filter((r) => !r.is_mapped);
  const missingLabels = rows.filter((r) => !r.display_label?.trim());
  const missingHints = rows.filter(
    (r) => r.field_key === "extract" && !r.extraction_hint?.trim()
  );
  const tokenSet = new Set(templateRows.map((r) => r.placeholder_token));
  const yellowFlags = Object.keys(template.org?.org_config ?? {}).filter(
    (key) => !tokenSet.has(key)
  );
  const canActivate =
    redFlags.length === 0 && missingLabels.length === 0 && missingHints.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
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

      {missingLabels.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-semibold">{missingLabels.length} token(s) missing a display label — </span>
          set a label for every token before activating.
        </div>
      )}

      {missingHints.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-semibold">{missingHints.length} EXTRACT token(s) missing an extraction hint — </span>
          Claude needs to know what to look for before this template can be activated.
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
          All {rows.length} tokens configured — template is ready to activate.
        </div>
      )}

      {canActivate && yellowFlags.length > 0 && rows.length > 0 && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          All {rows.length} tokens configured — template can be activated (review missing org fields above).
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
          template reset to draft. Labels and hints will need to be re-entered.
        </p>
        <ReuploadForm templateId={id} />
      </div>

      {/* Section labels */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Step 2 section headings</h2>
        <p className="mb-4 text-xs text-zinc-500">
          Labels shown to the client above each group of fields in the review step.
        </p>
        <SectionLabelsForm
          templateId={id}
          labels={template.section_labels ?? {
            extract: "Extracted from your documents",
            org: "Organisation details",
            client: "Additional information",
          }}
        />
      </div>

      {/* Template token table */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">
            Template tokens ({templateRows.length})
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Tokens found inside the .docx file. Set a display label, extraction hint, and order for each.
            Mark fields as required to block submission.
            <code className="ml-1 rounded bg-zinc-100 px-1 font-mono">EXTRACT_ADDRESS</code> is always used for duplicate detection.
            <code className="ml-1 rounded bg-zinc-100 px-1 font-mono">EXTRACT_TRUSTEE</code> and <code className="rounded bg-zinc-100 px-1 font-mono">EXTRACT_RAINFALL_INTENSITY</code> are auto-populated from the Halcyon table.
          </p>
        </div>

        {templateRows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-zinc-500">
            No placeholders found in this document.
          </p>
        ) : (
          <MappingTable rows={templateRows} templateId={id} missingOrgTokens={yellowFlags} />
        )}
      </div>

      {/* Extraction-only tokens */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">
            Extraction-only tokens ({extractionOnlyRows.length})
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Fields extracted from submitted documents but not present as placeholders in the .docx.
            Used for Halcyon lookups and other system operations. Optionally shown to the client if a display label is set.
          </p>
        </div>
        <AddExtractionTokenForm templateId={id} existingTokens={extractionOnlyRows} />
      </div>

      {/* File requirements */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-100 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">
            File requirements ({requirements.length})
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            Files the client must attach when submitting a project using this template.
            Set a name, identifier, upload limit, and whether the field is required or must be unique.
          </p>
        </div>
        <FileRequirementsSection templateId={id} requirements={requirements} />
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
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-zinc-100 text-zinc-500"}`}
    >
      {status}
    </span>
  );
}
