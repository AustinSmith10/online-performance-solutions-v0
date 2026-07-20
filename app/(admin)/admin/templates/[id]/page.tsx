import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { AdminSuccessBanner } from "@/components/AdminSuccessBanner";
import { MappingTable } from "./_components/mapping-table";
import { TemplateStatusActions } from "./_components/status-actions";
import { DeleteButton } from "./_components/delete-button";
import { RestoreButton } from "./_components/restore-button";
import { ReuploadForm } from "./_components/reupload-form";
import { ExtractionOnlyPanel } from "./_components/ExtractionOnlyPanel";
import { FileRequirementsSection } from "./_components/FileRequirementsSection";
import { SectionLabelsForm } from "./_components/SectionLabelsForm";
import { TemplateTabs } from "./_components/TemplateTabs";
import { AddFileRequirementForm } from "./_components/AddFileRequirementForm";
import { ClientProfileSection, type ClientProfileRow } from "./_components/ClientProfileSection";

const TEMPLATE_ACCENT: Record<string, string> = {
  active: "border-l-green-500",
  draft: "border-l-amber-400",
  inactive: "border-l-zinc-300",
};

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
  client_visible: boolean;
  client_sort_order: number;
};

type TemplateDetail = {
  id: string;
  name: string;
  status: string;
  storage_path: string;
  created_at: string;
  deleted_at: string | null;
  section_labels: { extract: string; org: string; client: string };
  org: { id: string; name: string; client_config: Record<string, string> } | null;
};

export default async function TemplatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  await requireRole("super_admin", "admin");
  const { id } = await params;
  const sp = await searchParams;
  const supabase = createAdminClient();

  const [{ data: tmpl }, { data: mappings, error: mappingsError }, { data: fileReqs }] = await Promise.all([
    supabase
      .from("templates")
      .select("id, name, status, storage_path, created_at, deleted_at, section_labels, org:client_id(id, name, client_config)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("template_field_mappings")
      .select("id, placeholder_token, field_key, is_mapped, in_template, display_label, extraction_hint, is_required, sort_order, client_visible, client_sort_order, comparison_mode")
      .eq("template_id", id)
      .order("sort_order", { ascending: true })
      .order("placeholder_token", { ascending: true }),
    supabase
      .from("file_requirements")
      .select("id, name, slug, max_count, required, no_duplicates, extraction")
      .eq("template_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  // A query error here (e.g. a schema column the DB hasn't migrated yet)
  // otherwise renders as an empty, silently misleading "no tokens" state —
  // surface it instead of hiding it.
  if (mappingsError) {
    console.error(`[admin/templates/${id}] template_field_mappings query failed:`, mappingsError);
  }

  if (!tmpl) notFound();

  const template = tmpl as unknown as TemplateDetail;
  const rows = (mappings ?? []) as MappingRow[];
  const requirements = (fileReqs ?? []) as {
    id: string; name: string; slug: string;
    max_count: number; required: boolean; no_duplicates: boolean; extraction: boolean;
  }[];
  const templateRows = rows.filter((r) => r.in_template);
  const extractionOnlyRows = rows.filter((r) => !r.in_template);

  const clientProfileTokens: ClientProfileRow[] = rows
    .filter((r) => r.field_key === "extract")
    .sort((a, b) => a.client_sort_order - b.client_sort_order || a.placeholder_token.localeCompare(b.placeholder_token));

  const redFlags = rows.filter((r) => !r.is_mapped);
  const missingLabels = rows.filter((r) => !r.display_label?.trim());
  const missingHints = rows.filter(
    (r) => r.field_key === "extract" && !r.extraction_hint?.trim()
  );
  const tokenSet = new Set(templateRows.map((r) => r.placeholder_token));
  const yellowFlags = Object.keys(template.org?.client_config ?? {}).filter(
    (key) => !tokenSet.has(key)
  );
  const canActivate =
    redFlags.length === 0 && missingLabels.length === 0 && missingHints.length === 0;

  const uploadedDate = new Date(template.created_at).toLocaleDateString("en-AU", {
    day: "numeric", month: "short", year: "numeric",
  });

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      {/* Breadcrumb */}
      <Link href="/admin/templates" className="text-sm text-zinc-500 hover:text-zinc-700">
        ← Templates
      </Link>

      {/* Header card */}
      <div className={`rounded-xl border border-zinc-200 border-l-[3px] ${TEMPLATE_ACCENT[template.status] ?? "border-l-zinc-300"} bg-white p-5`}>
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm font-semibold text-zinc-600">
            {template.name.slice(0, 2).toUpperCase()}
          </div>

          {/* Identity */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-semibold text-zinc-900">{template.name}</h1>
              <StatusBadge status={template.status} />
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-2">
            {template.deleted_at ? (
              <RestoreButton templateId={id} />
            ) : (
              <>
                <TemplateStatusActions templateId={id} status={template.status} canActivate={canActivate} />
                <DeleteButton templateId={id} />
              </>
            )}
          </div>
        </div>

        {template.deleted_at && (
          <p className="mt-3.5 border-t border-zinc-100 pt-3 text-sm font-medium text-red-600">
            Deleted on {new Date(template.deleted_at).toLocaleDateString("en-AU")} — restore to reuse.
          </p>
        )}

        <p className="mt-3.5 border-t border-zinc-100 pt-3 text-sm leading-relaxed text-zinc-500">
          {template.org && (
            <>
              Organisation{" "}
              <Link href={`/admin/clients/${template.org.id}`} className="font-medium text-zinc-900 hover:underline">
                {template.org.name}
              </Link>
              {" · "}
            </>
          )}
          Uploaded <span className="font-medium text-zinc-900">{uploadedDate}</span>
        </p>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Tokens" value={String(rows.length)} variant="neutral" />
          <StatCard label="File requirements" value={String(requirements.length)} variant="neutral" />
          <StatCard
            label="Unmapped"
            value={String(redFlags.length)}
            variant={redFlags.length > 0 ? "warning" : "neutral"}
          />
          <StatCard
            label="Ready to activate"
            value={canActivate ? "Yes" : "No"}
            variant={canActivate ? "success" : "neutral"}
          />
        </div>
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

      {/* Tabbed content */}
      <TemplateTabs
        tabs={[
          {
            label: `Tokens (${rows.length})`,
            content: (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xs text-zinc-500">
                    Set a display label and extraction hint for each token, drag to reorder, and mark fields as required to block submission.
                  </p>
                  <ExtractionOnlyPanel
                    templateId={id}
                    tokens={extractionOnlyRows}
                    highlightToken={sp.token_added}
                  />
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white">
                  <div className="border-b border-zinc-100 px-5 py-4">
                    <h2 className="text-sm font-semibold text-zinc-900">
                      Template tokens ({templateRows.length})
                    </h2>
                  </div>
                  {templateRows.length === 0 ? (
                    <p className="px-5 py-8 text-center text-sm text-zinc-500">
                      No placeholders found in this document.
                    </p>
                  ) : (
                    <MappingTable rows={templateRows} templateId={id} missingOrgTokens={yellowFlags} isActivated={template.status !== "draft"} />
                  )}
                </div>
              </div>
            ),
          },
          {
            label: "Section labels",
            content: (
              <div className="rounded-xl border border-zinc-200 bg-white p-5">
                <h2 className="mb-1 text-sm font-semibold text-zinc-900">Step 2 section headings</h2>
                <p className="mb-4 text-xs text-zinc-500">
                  Labels shown to the client above each group of fields in the review step.
                </p>
                <SectionLabelsForm
                  templateId={id}
                  isActivated={template.status !== "draft"}
                  labels={template.section_labels ?? {
                    extract: "Extracted from your documents",
                    extractDesc: "",
                    trusteeDesc: "",
                    org: "Client details",
                    orgDesc: "",
                    client: "Additional information",
                    clientDesc: "",
                  }}
                />
              </div>
            ),
          },
          {
            label: `File requirements (${requirements.length})`,
            content: (
              <div className="rounded-xl border border-zinc-200 bg-white">
                <div className="border-b border-zinc-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-zinc-900">
                    File requirements ({requirements.length})
                  </h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Files the client must attach when submitting a project using this template.
                  </p>
                </div>
                <div className="border-b border-zinc-100 bg-zinc-50/50 px-5 py-4">
                  <AddFileRequirementForm templateId={id} />
                </div>
                <div className="p-4">
                  <FileRequirementsSection templateId={id} requirements={requirements} />
                </div>
              </div>
            ),
          },
          {
            label: "Client profile",
            content: (
              <div className="rounded-xl border border-zinc-200 bg-white">
                <div className="border-b border-zinc-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-zinc-900">Client profile layout</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Controls which extracted values appear on the client&apos;s project page and in what order. Drag to reorder. Toggle visibility per field.
                  </p>
                </div>
                <ClientProfileSection templateId={id} tokens={clientProfileTokens} />
              </div>
            ),
          },
          {
            label: "Settings",
            content: (
              <div className="rounded-xl border border-zinc-200 bg-white">
                <div className="border-b border-zinc-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-zinc-900">Replace file</h2>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Upload a new .docx to replace the current file and re-extract tokens.
                  </p>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                    <span className="font-semibold">This action is destructive.</span>{" "}
                    The template will revert to draft and all display labels, extraction hints, and sort orders will need to be re-entered.
                  </div>
                  <ReuploadForm templateId={id} />
                </div>
              </div>
            ),
          },
        ]}
      />

      {/* Success banners */}
      {sp.activated === "1" && (
        <AdminSuccessBanner
          cleanUrl={`/admin/templates/${id}`}
          title="Template activated"
          body="This template is now available for new projects."
        />
      )}
      {sp.deactivated === "1" && (
        <AdminSuccessBanner
          cleanUrl={`/admin/templates/${id}`}
          title="Template deactivated"
          body="This template will no longer appear for new projects."
        />
      )}
      {sp.token_added && (
        <AdminSuccessBanner
          cleanUrl={`/admin/templates/${id}`}
          title="Extraction token added"
          body={`{${sp.token_added}} has been added to this template.`}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant: "success" | "warning" | "neutral";
}) {
  const valueClass =
    variant === "success"
      ? "text-green-700"
      : variant === "warning"
      ? "text-amber-700"
      : "text-zinc-900";
  const containerClass =
    variant === "warning"
      ? "rounded-r-lg border border-zinc-200 border-l-[3px] border-l-amber-400 bg-white px-3 py-2.5"
      : variant === "success"
      ? "rounded-r-lg border border-zinc-200 border-l-[3px] border-l-green-500 bg-white px-3 py-2.5"
      : "rounded-xl border border-zinc-200 bg-white px-3 py-2.5";

  return (
    <div className={containerClass}>
      <p className="text-[10px] text-zinc-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium ${valueClass}`}>{value}</p>
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
