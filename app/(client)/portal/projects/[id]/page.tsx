import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeleteProjectButton } from "./_components/DeleteProjectButton";
import { FileUploadForm } from "./_components/FileUploadForm";
import { PortalApprovalForm } from "./_components/PortalApprovalForm";
import { SubmissionSuccessBanner } from "./_components/SubmissionSuccessBanner";
import { prettifyToken } from "@/lib/tokens/prettify";
import { PbdrDownloadButton } from "@/components/PbdrDownloadButton";
import type { ProjectStatus } from "@/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Received",
  assigned: "Received",
  in_progress: "In Progress",
  dispatched: "Awaiting Approval",
  revision_required: "Changes Requested",
  converting: "Finalising Report",
  delivered: "Report Delivered",
  complete: "Complete",
  paused: "On Hold",
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-500",
  submitted: "bg-blue-100 text-blue-700",
  assigned: "bg-blue-100 text-blue-700",
  in_progress: "bg-purple-100 text-purple-700",
  dispatched: "bg-amber-100 text-amber-700",
  revision_required: "bg-red-100 text-red-700",
  converting: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500",
  paused: "bg-amber-100 text-amber-700",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  building_plans: "Building Plans",
  po: "Purchase Order",
  additional: "Additional",
};

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

// PBDB is visible to the client only once it has been dispatched for acknowledgement
const PBDB_VISIBLE_STATUSES = new Set<ProjectStatus>([
  "dispatched", "revision_required", "converting", "delivered", "complete",
]);

export default async function ClientProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const justSubmitted = sp.submitted === "1";
  const user = await requireRole("client");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select(
      "id, extracted_fields, status, po_number, template_id, created_at, expected_delivery_date, deleted_at, source"
    )
    .eq("id", id)
    .eq("org_id", user.org_id as string)
    .maybeSingle();

  if (!data) notFound();

  type ProjectDetail = {
    id: string;
    extracted_fields: Record<string, string> | null;
    status: ProjectStatus;
    po_number: string | null;
    template_id: string | null;
    created_at: string;
    expected_delivery_date: string | null;
    deleted_at: string | null;
    source: "portal" | "email";
  };

  const project = data as unknown as ProjectDetail;
  const isDeleted = !!project.deleted_at;
  const pbdbVisible = PBDB_VISIBLE_STATUSES.has(project.status);
  const todayIso = new Date().toISOString().slice(0, 10);
  const isOverdue =
    !!project.expected_delivery_date &&
    project.expected_delivery_date < todayIso &&
    !TERMINAL_STATUSES.has(project.status);

  // Fetch this client's most recent review for this project (any status)
  const { data: clientReview } = await supabase
    .from("stakeholder_reviews")
    .select("id, token, expires_at, review_cycle, status, comments, responded_at")
    .eq("project_id", id)
    .eq("stakeholder_email", user.email as string)
    .order("review_cycle", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Load template mappings, submission files, latest PBDB, and latest PBDR in parallel
  const [{ data: mappings }, { data: rawFiles }, { data: rawPbdbs }, { data: rawPbdrs }] = await Promise.all([
    project.template_id
      ? supabase
          .from("template_field_mappings")
          .select("placeholder_token, field_key, display_label")
          .eq("template_id", project.template_id)
          .order("placeholder_token")
      : Promise.resolve({ data: [] }),
    supabase
      .from("project_files")
      .select("id, file_type, original_filename, storage_path, created_at")
      .eq("project_id", id)
      .not("file_type", "in", '("pbdb","pbdr")')
      .order("created_at"),
    pbdbVisible
      ? supabase
          .from("project_files")
          .select("original_filename, created_at")
          .eq("project_id", id)
          .eq("file_type", "pbdb")
          .order("version", { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),
    supabase
      .from("project_files")
      .select("id, original_filename, storage_path, version, created_at")
      .eq("project_id", id)
      .eq("file_type", "pbdr")
      .order("version", { ascending: false })
      .limit(1),
  ]);

  // Submission files — signed URLs from `submissions` bucket
  const files = await Promise.all(
    (rawFiles ?? []).map(async (f) => {
      const { data: signed } = await supabase.storage
        .from("submissions")
        .createSignedUrl(f.storage_path as string, 3600);
      return { ...f, signedUrl: signed?.signedUrl ?? null };
    })
  );

  // PBDB — served via the client download route (applies colour stripping if enabled)
  const latestPbdb = rawPbdbs?.[0] ?? null;
  const pbdbDownloadUrl = latestPbdb ? `/api/download/pbdb-client/${id}` : null;

  // PBDR — latest version only, signed URL from `documents` bucket
  const latestPbdr = rawPbdrs?.[0] ?? null;
  let pbdrSignedUrl: string | null = null;
  if (latestPbdr) {
    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(latestPbdr.storage_path as string, 3600, {
        download: (latestPbdr.original_filename as string) || true,
      });
    pbdrSignedUrl = signed?.signedUrl ?? null;
  }

  // Build label map from template mappings
  const labelMap = new Map<string, string>(
    (mappings ?? []).map((m) => [
      m.placeholder_token as string,
      (m.display_label as string | null) ?? prettifyToken(m.placeholder_token as string),
    ])
  );

  const CLIENT_HIDDEN_TOKENS = new Set(["EXTRACT_RAINFALL_INTENSITY"]);
  const extractedFields = project.extracted_fields ?? {};
  const fieldEntries = Object.entries(extractedFields)
    .filter(([token]) => !CLIENT_HIDDEN_TOKENS.has(token))
    .map(([token, value]) => ({
      token,
      label: labelMap.get(token) ?? prettifyToken(token),
      value: value as string,
    }));

  const title =
    (project.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ||
    (project.po_number ? `PO ${project.po_number}` : project.id.slice(0, 8));

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <Link
        href={isDeleted ? "/portal/recovery" : "/portal"}
        className="text-sm text-zinc-500 hover:text-zinc-700"
      >
        {isDeleted ? "← Recovery bin" : "← My Reports"}
      </Link>

      {justSubmitted && <SubmissionSuccessBanner projectId={id} />}

      {isDeleted && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">This project is in the recovery bin.</span>{" "}
          It will be permanently deleted after 30 days.{" "}
          <Link href="/portal/recovery" className="font-medium underline hover:text-amber-900">
            Go to recovery bin →
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[project.status]}`}>
          {STATUS_LABELS[project.status]}
        </span>
        {isOverdue && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Overdue
          </span>
        )}
      </div>

      {/* Draft resume prompt — full-width, above the grid */}
      {!isDeleted && project.status === "draft" && (
        <Link
          href={`/portal/submit/resume/${project.id}`}
          className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-5 py-4 hover:bg-zinc-50 transition-colors"
        >
          <div>
            <p className="text-sm font-medium text-zinc-900">This submission is still a draft</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Your documents have been saved — click here to review and submit.
            </p>
          </div>
          <span className="ml-4 shrink-0 text-zinc-400">→</span>
        </Link>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
        {/* Left column: project summary + documents */}
        <div className="space-y-6">
          {/* Project summary */}
          <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
            <Row
              label="Submitted via"
              value={
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                  project.source === "email" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                }`}>
                  {project.source === "email" ? "Email" : "Portal"}
                </span>
              }
            />
            <Row label="PO number" value={project.po_number ?? "—"} />
            <Row
              label="Submitted"
              value={new Date(project.created_at).toLocaleDateString("en-AU", {
                day: "numeric", month: "long", year: "numeric",
              })}
            />
            <Row
              label="Expected delivery"
              value={
                project.expected_delivery_date ? (
                  <span className={isOverdue ? "text-red-600" : ""}>
                    Your report is due by{" "}
                    {new Date(project.expected_delivery_date).toLocaleDateString("en-AU", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                ) : "—"
              }
            />
          </div>

          {/* Documents */}
          <div className="rounded-lg border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-900">Documents</h2>
            </div>
            {files.length === 0 && !latestPbdb && !latestPbdr ? (
              <p className="px-5 py-6 text-sm text-zinc-500">No documents uploaded yet.</p>
            ) : (
              <div className="divide-y divide-zinc-100">
                {latestPbdr && (
                  <div className="flex items-center gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-900">{latestPbdr.original_filename as string}</p>
                      <p className="text-xs text-zinc-500">
                        Performance Based Design Report &middot;{" "}
                        {new Date(latestPbdr.created_at as string).toLocaleDateString("en-AU")}
                      </p>
                    </div>
                    {pbdrSignedUrl && (
                      <PbdrDownloadButton href={pbdrSignedUrl} filename={latestPbdr.original_filename as string} />
                    )}
                  </div>
                )}
                {latestPbdb && (
                  <div className="flex items-center gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-900">{latestPbdb.original_filename as string}</p>
                      <p className="text-xs text-zinc-500">
                        Performance Based Design Brief &middot;{" "}
                        {new Date(latestPbdb.created_at as string).toLocaleDateString("en-AU")}
                      </p>
                    </div>
                    {pbdbDownloadUrl && (
                      <a
                        href={pbdbDownloadUrl}
                        className="shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Download
                      </a>
                    )}
                  </div>
                )}
                {files.map((f) => (
                  <div key={f.id as string} className="flex items-center gap-4 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-900">{f.original_filename as string}</p>
                      <p className="text-xs text-zinc-500">
                        {FILE_TYPE_LABELS[f.file_type as string] ?? f.file_type} &middot;{" "}
                        {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                      </p>
                    </div>
                    {f.signedUrl && (
                      <a
                        href={f.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Download
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
            {!isDeleted && (
              <div className="border-t border-zinc-100 px-5 py-4">
                <FileUploadForm projectId={id} />
              </div>
            )}
          </div>

          {/* Delete / can't-delete notice */}
          {!isDeleted && (project.status === "draft" || project.status === "submitted") && (
            <div>
              <DeleteProjectButton projectId={project.id} />
            </div>
          )}
          {!isDeleted && !["draft", "submitted"].includes(project.status) && (
            <p className="text-xs text-zinc-400">
              This report has been assigned to a consultant and can no longer be deleted. Contact{" "}
              <a href="mailto:support@ddeg.com.au" className="underline hover:text-zinc-600">
                DDEG
              </a>{" "}
              if you need to cancel.
            </p>
          )}
        </div>

        {/* Right column: review card + submitted field values */}
        <div className="space-y-6">
          {/* PBDB review — inline form when pending, locked card when responded */}
          {clientReview && clientReview.status === "pending" && (
            <PortalApprovalForm
              reviewId={clientReview.id as string}
              projectId={id}
              pbdbDownloadUrl={pbdbDownloadUrl}
              expiresAt={clientReview.expires_at as string}
            />
          )}
          {clientReview && clientReview.status !== "pending" && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-5">
              <h2 className="text-sm font-semibold text-green-900">Your PBDB review has been recorded</h2>
              <p className="mt-1 text-sm text-green-800">
                You{" "}
                {(clientReview.status as string).startsWith("approved") ? "approved" : "requested changes to"}{" "}
                this PBDB
                {clientReview.responded_at
                  ? ` on ${new Date(clientReview.responded_at as string).toLocaleDateString("en-AU", {
                      day: "numeric", month: "long", year: "numeric",
                    })}`
                  : ""}.
              </p>
              {clientReview.comments && (
                <p className="mt-2 text-sm italic text-green-800">
                  &ldquo;{clientReview.comments as string}&rdquo;
                </p>
              )}
            </div>
          )}

          {/* Submitted field values */}
          {fieldEntries.length > 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white">
              <div className="border-b border-zinc-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-zinc-900">Submitted details</h2>
              </div>
              <div className="divide-y divide-zinc-100">
                {fieldEntries.map(({ token, label, value }) => (
                  <Row key={token} label={label} value={value || "—"} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 px-5 py-3">
      <span className="w-40 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-900">{value}</span>
    </div>
  );
}
