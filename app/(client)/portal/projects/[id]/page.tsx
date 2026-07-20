import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DeleteProjectButton } from "./_components/DeleteProjectButton";
import { FileUploadForm } from "./_components/FileUploadForm";
import { PortalApprovalForm } from "./_components/PortalApprovalForm";
import { ReplaceDocumentControl } from "./_components/ReplaceDocumentControl";
import { SubmissionDetailsCard, type OpenFieldFlag } from "./_components/SubmissionDetailsCard";
import { ReExtractButton } from "@/components/ReExtractButton";
import { SubmissionSuccessBanner } from "./_components/SubmissionSuccessBanner";
import { prettifyToken } from "@/lib/tokens/prettify";
import { DownloadCard } from "@/components/DownloadCard";
import { resolveStepperState, type StepperStage, type StepperStageKey } from "@/lib/delivery/stepper";
import { SUPPORT_MAILTO } from "@/lib/config/support";
import { ClientWorkspace } from "../../_components/ClientWorkspace";
import { ClientHeaderCard } from "../../_components/ClientHeaderCard";
import { DocGroupCard } from "../../_components/DocGroupCard";
import { FocusCard } from "@/components/workspace/FocusCard";
import type { Stage } from "@/components/workspace/StageRail";
import type { ProjectStatus } from "@/types";

const STAGE_ICON: Record<StepperStageKey, Stage["icon"]> = {
  submitted: "document",
  prepared: "refresh",
  review: "people",
  finalizing: "refresh",
  delivered: "flag",
};

function mapStepperStages(stages: StepperStage[]): Stage[] {
  return stages.map((s) => {
    const revising = s.visual === "revision-current";
    const current = s.visual === "current" || revising;
    return {
      id: s.key,
      label: revising ? "Revising" : s.label,
      icon: revising ? "refresh" : STAGE_ICON[s.key],
      state: s.visual === "complete" ? "done" : current ? "current" : "upcoming",
      urgency: revising || (current && s.key === "review") ? "amber" : "neutral",
    };
  });
}

const FILE_TYPE_LABELS: Record<string, string> = {
  building_plans: "Building Plans",
  building_drawing_plans: "Building Drawing Plans",
  po: "Purchase Order",
  purchase_order: "Purchase Order",
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
  const user = await requireRole("stakeholder");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select(
      "id, extracted_fields, status, po_number, template_id, created_at, expected_delivery_date, deleted_at, source, assigned_consultant_id, review_cycle, paused_previous_status, pbdb_downloaded_at"
    )
    .eq("id", id)
    .eq("client_id", user.client_id as string)
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
    assigned_consultant_id: string | null;
    review_cycle: number;
    paused_previous_status: ProjectStatus | null;
    pbdb_downloaded_at: string | null;
  };

  const project = data as unknown as ProjectDetail;
  const isDeleted = !!project.deleted_at;
  const isLocked = !!project.assigned_consultant_id;
  const pbdbVisible = PBDB_VISIBLE_STATUSES.has(project.status);

  // Stepper — resolve stage/caption from real status only, no simulated progress
  const [{ data: orgRow }, { data: consultant }, { data: templateRow }, { data: revisionNoteRow }] = await Promise.all([
    supabase.from("clients").select("show_consultant_name").eq("id", user.client_id as string).maybeSingle(),
    project.assigned_consultant_id
      ? supabase.from("users").select("first_name").eq("id", project.assigned_consultant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    project.template_id
      ? supabase.from("templates").select("name").eq("id", project.template_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("revision_notes")
      .select("note")
      .eq("project_id", id)
      .eq("review_cycle", project.review_cycle)
      .maybeSingle(),
  ]);

  const templateName = (templateRow?.name as string | null) ?? null;
  const consultantRevisionNote = (revisionNoteRow?.note as string | null) ?? null;

  const stepperResult = resolveStepperState({
    status: project.status,
    pausedPreviousStatus: project.paused_previous_status,
    reviewCycle: project.review_cycle,
    pbdbDownloadedAt: project.pbdb_downloaded_at,
    showConsultantName: orgRow?.show_consultant_name ?? true,
    consultantFirstName: consultant?.first_name ?? null,
    viewerFirstName: (user.first_name as string | null) ?? null,
  });
  const stages = mapStepperStages(stepperResult.stages);
  const currentStageLabel = stages.find((s) => s.state === "current")?.label ?? null;

  // Fetch this client's most recent review for this project (any status), and
  // the full history for the Review tab
  const [{ data: clientReview }, { data: clientReviewHistory }] = await Promise.all([
    supabase
      .from("stakeholder_reviews")
      .select("id, token, expires_at, review_cycle, status, comments, responded_at")
      .eq("project_id", id)
      .eq("stakeholder_email", user.email as string)
      .order("review_cycle", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("stakeholder_reviews")
      .select("review_cycle, status, comments, responded_at")
      .eq("project_id", id)
      .eq("stakeholder_email", user.email as string)
      .not("responded_at", "is", null)
      .order("review_cycle", { ascending: false }),
  ]);

  // Load template mappings, submission files, latest PBDB, latest PBDR, and
  // open field flags in parallel
  const [{ data: mappings }, { data: rawFiles }, { data: rawPbdbs }, { data: rawPbdrs }, { data: openFieldFlags }] =
    await Promise.all([
      project.template_id
        ? supabase
            .from("template_field_mappings")
            .select("placeholder_token, field_key, display_label, client_visible, client_sort_order")
            .eq("template_id", project.template_id)
            .order("client_sort_order", { ascending: true })
            .order("placeholder_token", { ascending: true })
        : Promise.resolve({ data: [] }),
      supabase
        .from("project_files")
        .select("id, file_type, original_filename, storage_path, created_at")
        .eq("project_id", id)
        .not("file_type", "in", '("pbdb","pbdr","pbdb_pdf")')
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
      supabase
        .from("field_flags")
        .select("id, field_key, candidate_values")
        .eq("project_id", id)
        .eq("status", "open"),
    ]);

  const flagsByToken: Record<string, OpenFieldFlag> = Object.fromEntries(
    (openFieldFlags ?? []).map((f) => [
      f.field_key as string,
      { id: f.id as string, candidates: (f.candidate_values ?? []) as OpenFieldFlag["candidates"] },
    ])
  );

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
  type MappingEntry = {
    placeholder_token: string;
    display_label: string | null;
    client_visible: boolean | null;
    client_sort_order: number | null;
  };

  const mappingEntries = (mappings ?? []) as MappingEntry[];

  const labelMap = new Map<string, string>(
    mappingEntries.map((m) => [
      m.placeholder_token,
      m.display_label ?? prettifyToken(m.placeholder_token),
    ])
  );
  const visibleTokens = new Set(
    mappingEntries
      .filter((m) => m.client_visible !== false)
      .map((m) => m.placeholder_token)
  );

  const extractedFields = project.extracted_fields ?? {};
  const fieldEntries = Object.entries(extractedFields)
    .filter(([token]) => visibleTokens.has(token))
    .sort(([a], [b]) => {
      const ma = mappingEntries.find((m) => m.placeholder_token === a);
      const mb = mappingEntries.find((m) => m.placeholder_token === b);
      return (ma?.client_sort_order ?? 0) - (mb?.client_sort_order ?? 0);
    })
    .map(([token, value]) => ({
      token,
      label: labelMap.get(token) ?? prettifyToken(token),
      value: value as string,
    }));

  const address =
    (project.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) || null;
  const title = address || (project.po_number ? `PO ${project.po_number}` : project.id.slice(0, 8));

  const submittedLabel = new Date(project.created_at).toLocaleDateString("en-AU");
  const dueLabel = project.expected_delivery_date
    ? new Date(project.expected_delivery_date).toLocaleDateString("en-AU")
    : null;

  const subtitleParts = [
    templateName,
    project.status !== "draft" ? `Submitted ${submittedLabel}` : null,
    project.status !== "draft" && dueLabel ? `Due ${dueLabel}` : null,
  ].filter(Boolean);

  // ── Focus card (the one thing that needs the client right now) ───────────
  let focusCard: React.ReactNode;
  if (isDeleted) {
    focusCard = (
      <FocusCard tone="amber" title="In the recovery bin" subtitle="Permanently deleted after 30 days.">
        <Link href="/portal/recovery" className="text-sm font-medium text-amber-800 underline hover:text-amber-900">
          Go to recovery bin →
        </Link>
      </FocusCard>
    );
  } else if (project.status === "draft") {
    focusCard = (
      <FocusCard tone="neutral" title="Continue your request" subtitle="Your documents have been saved.">
        <Link
          href={`/portal/submit/resume/${project.id}`}
          className="flex w-full items-center justify-center rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Review and submit →
        </Link>
      </FocusCard>
    );
  } else if (stepperResult.isPaused) {
    focusCard = (
      <FocusCard tone="neutral" title="On hold" subtitle="Nothing needed from you right now.">
        <p className="text-sm text-zinc-600">This project has been paused. We&apos;ll notify you once it resumes.</p>
      </FocusCard>
    );
  } else if (project.status === "dispatched" && clientReview && clientReview.status === "pending") {
    focusCard = (
      <FocusCard
        tone="amber"
        title="Please review the brief"
        subtitle={
          project.review_cycle > 1
            ? `Round ${project.review_cycle} · updated based on your last comments.`
            : "This is the one step that needs you."
        }
      >
        <div className="space-y-3">
          {consultantRevisionNote && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Note from your consultant
              </p>
              <p className="mt-1 text-sm text-blue-900">{consultantRevisionNote}</p>
            </div>
          )}
          <PortalApprovalForm
            reviewId={clientReview.id as string}
            projectId={id}
            pbdbDownloadUrl={pbdbDownloadUrl}
            pbdbFilename={latestPbdb?.original_filename as string | undefined}
            expiresAt={clientReview.expires_at as string}
            bare
          />
        </div>
      </FocusCard>
    );
  } else if (project.status === "revision_required") {
    focusCard = (
      <FocusCard
        tone="amber"
        title="Applying your requested changes"
        subtitle={
          project.review_cycle > 1
            ? `Round ${project.review_cycle} · nothing needed from you right now.`
            : "Nothing needed from you right now."
        }
      >
        <p className="text-sm text-zinc-600">
          Your consultant is updating the brief based on your comments. You&apos;ll be asked to review
          again once it&apos;s ready.
        </p>
        {clientReview?.comments && (
          <p className="mt-3 rounded-md bg-white/60 px-3 py-2 text-sm italic text-amber-900">
            &ldquo;{clientReview.comments as string}&rdquo;
          </p>
        )}
      </FocusCard>
    );
  } else if (project.status === "converting") {
    focusCard = (
      <FocusCard tone="neutral" title="Finalising your report" subtitle="Almost there.">
        <p className="text-sm text-zinc-600">Your brief is approved — the final report is being prepared now.</p>
      </FocusCard>
    );
  } else if (TERMINAL_STATUSES.has(project.status) && latestPbdr) {
    focusCard = (
      <FocusCard tone="green" title="Your report is ready" subtitle="Download it any time from Documents.">
        <DownloadCard
          href={pbdrSignedUrl}
          filename={latestPbdr.original_filename as string}
          wrapperClassName="flex items-center justify-between gap-3 rounded-md border border-emerald-200 bg-white px-3 py-2"
          buttonClassName="shrink-0 rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
        >
          <p className="truncate text-sm text-zinc-900">{latestPbdr.original_filename as string}</p>
        </DownloadCard>
      </FocusCard>
    );
  } else {
    focusCard = (
      <FocusCard tone="neutral" title="We're on it" subtitle="Nothing needed from you right now.">
        <p className="text-sm text-zinc-600">{stepperResult.caption}</p>
      </FocusCard>
    );
  }

  // ── Left rail reference card ──────────────────────────────────────────────
  const leftRailExtras = !isDeleted && project.status !== "draft" && (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Reference</p>
      <dl className="space-y-1.5 text-zinc-700">
        {templateName && (
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-400">Report type</dt>
            <dd className="text-right">{templateName}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-400">Submitted</dt>
          <dd>{submittedLabel}</dd>
        </div>
        {dueLabel && (
          <div className="flex justify-between gap-3">
            <dt className="text-zinc-400">Due</dt>
            <dd>{dueLabel}</dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-zinc-400">PO number</dt>
          <dd>{project.po_number || "—"}</dd>
        </div>
      </dl>
    </div>
  );

  // ── Overview tab ───────────────────────────────────────────────────────────
  const overviewTab = (
    <div className="space-y-3">
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">What&apos;s happening</h2>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          {isDeleted
            ? "This project is in the recovery bin and will be permanently deleted after 30 days."
            : project.status === "draft"
            ? "Your documents have been saved as a draft — continue from the panel on the left to submit your request."
            : stepperResult.caption}
        </p>
      </div>
      {!isDeleted && (
        <SubmissionDetailsCard
          projectId={id}
          poNumber={project.po_number}
          fieldEntries={fieldEntries}
          locked={isLocked}
          flagsByToken={flagsByToken}
        />
      )}
      {/* Draft projects already get a fresh extraction via the resume/step-2
          flow — re-extract is for re-checking documents added after
          submission, so it only makes sense once a project is past draft. */}
      {!isDeleted && project.status !== "draft" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">Re-check documents</h2>
          <p className="mb-3 text-sm text-zinc-500">
            Added a document since submitting, or think something was misread? Re-run extraction
            against your uploaded documents.
          </p>
          <ReExtractButton projectId={id} />
        </div>
      )}
    </div>
  );

  // ── Documents tab ──────────────────────────────────────────────────────────
  const documentsTab = (
    <div className="space-y-3">
      {files.length > 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 2a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V7.914a2 2 0 00-.586-1.414l-3.914-3.914A2 2 0 0012.086 2H4zm7 1.5V6a1 1 0 001 1h2.5L11 3.5zM6 9a1 1 0 000 2h8a1 1 0 100-2H6zm0 4a1 1 0 100 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Your files</p>
          </div>
          <div className="space-y-1.5">
            {files.map((f) => (
              <div key={f.id as string} className="space-y-1">
                <DownloadCard
                  href={f.signedUrl}
                  originalFilename={f.original_filename as string}
                  wrapperClassName="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2"
                  buttonClassName="shrink-0 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                >
                  <p className="truncate text-xs font-medium text-zinc-900">
                    {FILE_TYPE_LABELS[f.file_type as string] ?? f.file_type}
                  </p>
                  <p className="mt-0.5 text-[11px] text-zinc-400">
                    {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                  </p>
                </DownloadCard>
                {!isDeleted && !isLocked && (
                  <ReplaceDocumentControl projectId={id} fileId={f.id as string} />
                )}
              </div>
            ))}
          </div>
          {!isDeleted && isLocked && (
            <p className="mt-3 text-xs text-amber-800">
              Under review — existing documents can no longer be replaced, but you can still add new ones below.
            </p>
          )}
        </div>
      )}

      {latestPbdb && (
        <DocGroupCard
          icon="document"
          label="PBDB"
          files={[
            {
              id: "pbdb",
              name: latestPbdb.original_filename as string,
              href: pbdbDownloadUrl,
              date: new Date(latestPbdb.created_at as string).toLocaleDateString("en-AU"),
              version: project.review_cycle,
              badge: project.status === "dispatched" ? "Awaiting your review" : undefined,
              note: consultantRevisionNote ?? undefined,
            },
          ]}
        />
      )}

      {latestPbdr && (
        <DocGroupCard
          icon="flag"
          label="PBDR"
          files={[
            {
              id: "pbdr",
              name: latestPbdr.original_filename as string,
              href: pbdrSignedUrl,
              date: new Date(latestPbdr.created_at as string).toLocaleDateString("en-AU"),
              version: latestPbdr.version as number,
            },
          ]}
        />
      )}

      {files.length === 0 && !latestPbdb && !latestPbdr && (
        <p className="rounded-lg border border-zinc-200 bg-white px-5 py-6 text-sm text-zinc-500">
          No documents uploaded yet.
        </p>
      )}

      {!isDeleted && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <FileUploadForm projectId={id} />
        </div>
      )}

      {!isDeleted && (project.status === "draft" || project.status === "submitted") && (
        <DeleteProjectButton projectId={project.id} />
      )}
      {!isDeleted && !["draft", "submitted"].includes(project.status) && (
        <p className="text-xs text-zinc-400">
          This report has been assigned to a consultant and can no longer be deleted. Contact{" "}
          <a href={SUPPORT_MAILTO} className="underline hover:text-zinc-600">DDEG</a> if you need to cancel.
        </p>
      )}
    </div>
  );

  // ── Review tab ─────────────────────────────────────────────────────────────
  const reviewHistory = (clientReviewHistory ?? []) as {
    review_cycle: number;
    status: string;
    comments: string | null;
    responded_at: string;
  }[];

  const reviewTab = (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-zinc-900">Review history</h2>
      {reviewHistory.length === 0 && !(project.status === "dispatched" && clientReview?.status === "pending") && (
        <p className="mt-2 text-sm text-zinc-500">No review requested yet.</p>
      )}
      {project.status === "dispatched" && clientReview?.status === "pending" && (
        <p className="mt-2 text-sm text-zinc-500">
          Round {project.review_cycle} pending — respond using the review card on the left.
        </p>
      )}
      {reviewHistory.length > 0 && (
        <ul className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
          {reviewHistory.map((ev, i) => {
            const approved = ev.status.startsWith("approved");
            return (
              <li key={i} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-zinc-900">
                    Round {ev.review_cycle} —{" "}
                    {approved ? (
                      <span className="text-emerald-700">Approved</span>
                    ) : (
                      <span className="text-amber-700">Changes requested</span>
                    )}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {new Date(ev.responded_at).toLocaleDateString("en-AU")}
                  </span>
                </div>
                {ev.comments && <p className="mt-1 italic text-zinc-600">&ldquo;{ev.comments}&rdquo;</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <Link
        href={isDeleted ? "/portal/recovery" : "/portal"}
        className="text-sm text-zinc-500 hover:text-zinc-700"
      >
        {isDeleted ? "← Recovery bin" : "← My Reports"}
      </Link>

      {justSubmitted && <SubmissionSuccessBanner projectId={id} />}

      <ClientWorkspace
        header={
          <ClientHeaderCard
            title={title}
            subtitle={
              subtitleParts.length > 0
                ? subtitleParts.join(" · ")
                : "Tell us what you need — we'll set up your workspace as soon as you submit."
            }
            statusLabel={isDeleted ? "In recovery bin" : project.status === "draft" ? "Draft" : currentStageLabel ?? undefined}
            roundBadge={project.review_cycle}
          />
        }
        stages={stages}
        focusCard={focusCard}
        leftRailExtras={leftRailExtras}
        overviewTab={overviewTab}
        documentsTab={documentsTab}
        reviewTab={reviewTab}
      />
    </div>
  );
}
