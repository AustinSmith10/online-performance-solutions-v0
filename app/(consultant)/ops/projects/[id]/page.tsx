import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { FileUploadForm } from "./_components/FileUploadForm";
import { ProjectNumberForm } from "./_components/ProjectNumberForm";
import { PbdbQaUploadForm } from "./_components/PbdbQaUploadForm";
import { QaUploadedBanner } from "./_components/QaUploadedBanner";
import { prettifyToken } from "@/lib/tokens/prettify";
import { ProjectStripColorToggle } from "@/components/ProjectStripColorToggle";
import { ProjectDeliveryDelayPresetSelect } from "@/components/ProjectDeliveryDelayPresetSelect";
import { PendingDeliveryPanel } from "@/components/PendingDeliveryPanel";
import type { DeliveryDelayPreset } from "@/lib/delivery/delivery-delay";
import { getDeliveryDelayDurations } from "@/lib/settings/delivery-delay";
import { DownloadCard } from "@/components/DownloadCard";
import { ConfirmFileTypeControl } from "@/components/ConfirmFileTypeControl";
import { AttachEvidenceForm } from "@/components/AttachEvidenceForm";
import { GeneratePbdbButton } from "@/components/PbdbGenerationButtons";
import { GeneratedPbdbDownload } from "@/components/GeneratedPbdbDownload";
import { PickedUpBanner } from "@/app/(consultant)/ops/_components/PickedUpBanner";
import { AdminSuccessBanner } from "@/components/AdminSuccessBanner";
import { CollapsibleSection } from "./_components/CollapsibleSection";
import { ProjectDetailsEditor, type OpenFieldFlag } from "./_components/ProjectDetailsEditor";
import { ReExtractButton } from "@/components/ReExtractButton";
import { ProjectAuditTrail, type ProjectAuditRow } from "./_components/ProjectAuditTrail";
import { LogStakeholderResponseForm } from "./_components/LogStakeholderResponseForm";
import { PROJECT_AUDIT_EXCLUDED_EVENTS } from "@/lib/audit/project-scope";
import type { ProjectStatus } from "@/types";
import { HeaderStatInline } from "./_components/HeaderStatInline";
import { FocusCard } from "@/components/workspace/FocusCard";
import { AltWorkspace } from "./_components/AltWorkspace";
import { RevisionNoteField } from "./_components/RevisionNoteField";
import { ProjectNumberCard } from "./_components/ProjectNumberCard";
import { PbdbVersionsCard } from "./_components/PbdbVersionsCard";
import type { Stage } from "@/components/workspace/StageRail";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  dispatched: "Awaiting Approval",
  revision_required: "Revision Required",
  converting: "Converting to PBDR",
  delivered: "Delivered",
  complete: "Complete",
  paused: "Paused",
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-500",
  submitted: "bg-blue-100 text-blue-700",
  assigned: "bg-yellow-100 text-yellow-700",
  in_progress: "bg-purple-100 text-purple-700",
  dispatched: "bg-amber-100 text-amber-700",
  revision_required: "bg-red-100 text-red-700",
  converting: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500",
  paused: "bg-amber-100 text-amber-700",
};

const STATUS_ACCENT: Record<ProjectStatus, string> = {
  draft: "border-l-zinc-300",
  submitted: "border-l-blue-400",
  assigned: "border-l-yellow-400",
  in_progress: "border-l-purple-400",
  dispatched: "border-l-amber-400",
  revision_required: "border-l-red-400",
  converting: "border-l-purple-400",
  delivered: "border-l-green-500",
  complete: "border-l-zinc-300",
  paused: "border-l-amber-400",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  building_plans: "Building Plans",
  building_drawing_plans: "Building Drawing Plans",
  po: "Purchase Order",
  purchase_order: "Purchase Order",
  additional: "Additional",
};

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

export default async function ConsultantProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const justPickedUp = sp.picked_up === "1";
  const justUploadedQa = sp.qa_uploaded === "1";
  const justQueueApproved = sp.queue_approved === "1";
  const user = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, extracted_fields, status, po_number, project_number, template_id, review_cycle, created_at, expected_delivery_date, source, strip_token_color, delivery_delay_preset, qa_completed_by, accepted_at, pbdb_downloaded_at, clients(name, state_territory, client_config, revision_notes_required), submitter:users!projects_submitted_by_fkey(first_name, last_name, email, phone, company_role)"
    )
    .eq("id", id)
    .eq("assigned_consultant_id", user.id)
    .maybeSingle();

  if (error) console.error(`[ops/projects/${id}] project query failed:`, error);
  if (!data) notFound();

  type ProjectDetail = {
    id: string;
    extracted_fields: Record<string, string> | null;
    status: ProjectStatus;
    po_number: string | null;
    project_number: string | null;
    template_id: string | null;
    review_cycle: number;
    created_at: string;
    expected_delivery_date: string | null;
    source: "portal" | "email";
    strip_token_color: boolean;
    delivery_delay_preset: DeliveryDelayPreset;
    qa_completed_by: string | null;
    accepted_at: string | null;
    pbdb_downloaded_at: string | null;
    clients: {
      name: string;
      state_territory: string | null;
      client_config: Record<string, string>;
      revision_notes_required: boolean;
    } | null;
    submitter: {
      first_name: string | null;
      last_name: string | null;
      email: string;
      phone: string | null;
      company_role: string | null;
    } | null;
  };

  const project = data as unknown as ProjectDetail;
  const todayIso = new Date().toISOString().slice(0, 10);

  // Admin-pushed assignment awaiting the consultant's response — accept/decline
  // happens inline on the highlighted card in the workspace list (/ops), not here.
  // The card isn't navigable, so this only guards stale links; send them back
  // rather than exposing full project details (this is templated work; the
  // consultant only needs to judge bandwidth, not the specific project).
  if (!project.accepted_at) {
    redirect("/ops");
  }

  const isOverdue =
    !!project.expected_delivery_date &&
    project.expected_delivery_date < todayIso &&
    !TERMINAL_STATUSES.has(project.status);

  const [
    { data: mappings },
    { data: rawSubmissionFiles },
    { data: rawEvidenceFiles },
    { data: rawPbdbFiles },
    { data: rawPbdrFiles },
    { data: rawReviews },
    { data: rawFileRequirements },
    { data: rawAuditEntries },
    { data: rawRevisionNotes },
    { data: pendingDelivery },
    { data: openFieldFlags },
  ] = await Promise.all([
    project.template_id
      ? supabase
          .from("template_field_mappings")
          .select("placeholder_token, field_key, display_label")
          .eq("template_id", project.template_id)
          .order("placeholder_token")
      : Promise.resolve({ data: [] }),
    supabase
      .from("project_files")
      .select("id, file_type, file_type_confirmed, original_filename, storage_path, created_at")
      .eq("project_id", id)
      .not("file_type", "in", "(pbdb,pbdr,evidence,pbdb_pdf)")
      .order("created_at"),
    supabase
      .from("project_files")
      .select("id, original_filename, storage_path, reference, created_at")
      .eq("project_id", id)
      .eq("file_type", "evidence")
      .order("created_at", { ascending: false }),
    supabase
      .from("project_files")
      .select("id, original_filename, storage_path, version, review_cycle, created_at")
      .eq("project_id", id)
      .eq("file_type", "pbdb")
      .order("version", { ascending: true }),
    supabase
      .from("project_files")
      .select("id, original_filename, storage_path, version, created_at")
      .eq("project_id", id)
      .eq("file_type", "pbdr")
      .order("version", { ascending: true }),
    supabase
      .from("stakeholder_reviews")
      .select(
        "id, stakeholder_name, stakeholder_email, status, comments, responded_at, review_cycle, email_reply_text, email_reply_received_at, email_reply_sender_verified"
      )
      .eq("project_id", id)
      .order("review_cycle", { ascending: false })
      .order("responded_at", { ascending: true }),
    supabase
      .from("file_requirements")
      .select("slug, name")
      .order("sort_order"),
    supabase
      .from("audit_log")
      .select("id, event_type, actor_email, metadata, created_at")
      .eq("project_id", id)
      .not("event_type", "in", `(${PROJECT_AUDIT_EXCLUDED_EVENTS.join(",")})`)
      .order("created_at", { ascending: true }),
    supabase
      .from("revision_notes")
      .select("review_cycle, note")
      .eq("project_id", id),
    supabase.from("pending_deliveries").select("scheduled_for").eq("project_id", id).maybeSingle(),
    supabase
      .from("field_flags")
      .select("id, field_key, candidate_values, type")
      .eq("project_id", id)
      .eq("status", "open"),
  ]);

  const flagsByToken: Record<string, OpenFieldFlag> = Object.fromEntries(
    (openFieldFlags ?? []).map((f) => [
      f.field_key as string,
      {
        id: f.id as string,
        candidates: (f.candidate_values ?? []) as OpenFieldFlag["candidates"],
        type: f.type as OpenFieldFlag["type"],
      },
    ])
  );

  const revisionNotesByCycle = new Map<number, string>(
    (rawRevisionNotes ?? []).map((r) => [r.review_cycle as number, r.note as string])
  );

  const auditEntries = (rawAuditEntries ?? []) as ProjectAuditRow[];

  const fileReqLabelMap = new Map<string, string>(
    (rawFileRequirements ?? []).map((r) => [r.slug as string, r.name as string])
  );

  const [submissionFiles, evidenceFiles, pbdrFiles] = await Promise.all([
    Promise.all(
      (rawSubmissionFiles ?? []).map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("submissions")
          .createSignedUrl(f.storage_path as string, 3600);
        return { ...f, signedUrl: signed?.signedUrl ?? null };
      })
    ),
    Promise.all(
      (rawEvidenceFiles ?? []).map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("evidence")
          .createSignedUrl(f.storage_path as string, 3600);
        return { ...f, signedUrl: signed?.signedUrl ?? null };
      })
    ),
    Promise.resolve(rawPbdrFiles ?? []),
  ]);

  const pbdbFiles = rawPbdbFiles ?? [];
  const latestPbdb = pbdbFiles[pbdbFiles.length - 1] ?? null;

  // Auto-attached evidence from an email reply (#68) is stored with reference
  // `stakeholder_review:{reviewId}` — key it here so LogStakeholderResponseForm
  // can offer it instead of forcing a fresh upload.
  const evidenceByReviewId = new Map<string, (typeof evidenceFiles)[number]>();
  for (const f of evidenceFiles) {
    const ref = f.reference as string | null;
    if (ref?.startsWith("stakeholder_review:")) {
      evidenceByReviewId.set(ref.slice("stakeholder_review:".length), f);
    }
  }

  type ReviewRow = {
    id: string; stakeholder_name: string; stakeholder_email: string;
    status: string; comments: string | null; responded_at: string | null; review_cycle: number;
    email_reply_text: string | null; email_reply_received_at: string | null;
    email_reply_sender_verified: boolean | null;
  };
  const allReviews = (rawReviews ?? []) as ReviewRow[];
  const reviewsByCycle = new Map<number, ReviewRow[]>();
  for (const r of allReviews) {
    if (!reviewsByCycle.has(r.review_cycle)) reviewsByCycle.set(r.review_cycle, []);
    reviewsByCycle.get(r.review_cycle)!.push(r);
  }
  const reviewCycles = [...reviewsByCycle.keys()].sort((a, b) => b - a);

  const labelMap = new Map<string, string>(
    (mappings ?? []).map((m) => [
      m.placeholder_token as string,
      (m.display_label as string | null) ?? prettifyToken(m.placeholder_token as string),
    ])
  );

  const extractedFields = project.extracted_fields ?? {};

  const clientFieldEntries = Object.entries(extractedFields)
    .filter(([token]) => token.startsWith("EXTRACT_") || token.startsWith("CLIENT_"))
    .map(([token, value]) => ({
      token,
      label: labelMap.get(token) ?? prettifyToken(token),
      value: value as string,
    }));

  const orgConfig = (project.clients?.client_config ?? {}) as Record<string, string>;
  const orgMerged: Record<string, string> = { ...orgConfig };
  for (const [k, v] of Object.entries(extractedFields)) {
    if (k.startsWith("ORG_")) orgMerged[k] = v as string;
  }
  const orgTokenEntries = Object.entries(orgMerged)
    .filter(([k]) => k.startsWith("ORG_"))
    .map(([token, value]) => ({
      token,
      label: labelMap.get(token) ?? prettifyToken(token),
      value: value as string,
    }));

  const fmtDMY = (d: Date) =>
    `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  const latestGenDate = latestPbdb ? new Date(latestPbdb.created_at as string) : null;
  const latestVersion = latestPbdb ? (latestPbdb.version as number) : null;
  const sysValues: { label: string; value: string }[] = [
    {
      label: "Project number",
      value: project.project_number ? `${project.project_number}-S` : "Not yet set",
    },
    { label: "Submission date", value: fmtDMY(new Date(project.created_at)) },
    {
      label: "Generation date",
      value: latestGenDate ? fmtDMY(latestGenDate) : "Not yet generated",
    },
    {
      label: "Revision number",
      value: latestVersion !== null ? String(latestVersion - 1) : "0",
    },
  ];

  const addr = (project.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ?? null;
  const title = (project.project_number && addr)
    ? `${project.project_number} — ${addr}`
    : addr ?? (project.po_number ? `PO ${project.po_number}` : project.id.slice(0, 8));

  // Step states
  const isTerminal = TERMINAL_STATUSES.has(project.status) || project.status === "converting";
  const step2Locked = !project.project_number;
  const canRegeneratePbdb = (["assigned", "in_progress"] as ProjectStatus[]).includes(project.status);

  const currentCycleReviews = reviewsByCycle.get(project.review_cycle) ?? [];
  const currentCycleComments = currentCycleReviews.filter((r) => r.comments);
  const pendingCount = currentCycleReviews.filter((r) => r.status === "pending").length;

  const pbdbCardState: "locked" | "upload" | "pending" | "revision" | "approved" = !latestPbdb
    ? "locked"
    : project.status === "dispatched"
    ? "pending"
    : project.status === "revision_required"
    ? "revision"
    : isTerminal || project.status === "converting"
    ? "approved"
    : "upload";

  const UPLOAD_NEW_VERSION_COPY =
    "Uploading a new version will reset all stakeholder approvals and resend the approval email with the updated document.";

  const altHeaderCard = (
    <div className={`rounded-xl border border-zinc-200 border-l-[3px] ${STATUS_ACCENT[project.status]} bg-white p-5`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h1 className="text-base font-semibold text-zinc-900">{title}</h1>
        <span className="text-sm text-zinc-400">{project.clients?.name ?? "No organisation"}</span>
        <span className={`self-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[project.status]}`}>
          {STATUS_LABELS[project.status]}
        </span>
        <span className={`self-center inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          project.source === "email" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
        }`}>
          {project.source === "email" ? "Email" : "Portal"}
        </span>
        {isOverdue && (
          <span className="self-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Overdue
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-1.5 border-t border-zinc-100 pt-3 text-sm">
        <span
          className="inline-flex items-center gap-1 text-zinc-500"
          title={`Review cycle ${project.review_cycle}`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 002.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0112.888 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
          </svg>
          <span className="font-medium text-zinc-900">{project.review_cycle}</span>
        </span>
        <HeaderStatInline label="Submitted" value={fmtDMY(new Date(project.created_at))} noLeftBorder />
        <HeaderStatInline
          label="Due"
          value={project.expected_delivery_date ? fmtDMY(new Date(project.expected_delivery_date)) : "—"}
          valueClassName={isOverdue ? "text-red-600" : undefined}
        />
        <HeaderStatInline
          value={project.project_number ? `#${project.project_number}-S` : "Project number not yet set"}
        />
      </div>
    </div>
  );

  const auditTab = (
    <div className="space-y-3">
      {auditEntries.length > 0 && (
        <div className="flex justify-end gap-2">
          <a
            href={`/api/download/audit-export/project/${id}?format=csv`}
            className="rounded border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Export CSV
          </a>
          <a
            href={`/api/download/audit-export/project/${id}?format=pdf`}
            title="A locked-down PDF rendering, for when the export must not be trivially editable"
            className="rounded border border-zinc-300 px-4 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Export PDF
          </a>
        </div>
      )}
      <ProjectAuditTrail entries={auditEntries} />
    </div>
  );

  const deliveryDurations = await getDeliveryDelayDurations(supabase);
  const deliveryLocked = isTerminal || project.status === "converting" || !!pendingDelivery;

  // --- Stage rail: whole workflow at a glance instead of 3 stacked step cards ---
  const reviewDone = pbdbCardState === "approved";
  const convertingDone = pbdrFiles.length > 0 || project.status === "complete";
  const deliveredDone = project.status === "delivered" || project.status === "complete";
  const stageList: Stage[] = [
    {
      id: "number",
      label: "Project number",
      state: project.project_number ? "done" : "current",
      icon: "number",
    },
    {
      id: "pbdb",
      label: "PBDB generated",
      state: pbdbFiles.length > 0 ? "done" : project.project_number ? "current" : "upcoming",
      icon: "document",
    },
    {
      id: "review",
      label: "Stakeholder review",
      state: reviewDone ? "done" : pbdbFiles.length > 0 ? "current" : "upcoming",
      urgency: pbdbCardState === "revision" ? "red" : pbdbCardState === "pending" ? "amber" : "neutral",
      icon: "people",
    },
    {
      id: "converting",
      label: "Converting to PBDR",
      state: convertingDone ? "done" : reviewDone ? "current" : "upcoming",
      urgency: "green",
      icon: "refresh",
    },
    {
      id: "delivered",
      label: "Delivered",
      state: deliveredDone ? "done" : convertingDone ? "current" : "upcoming",
      icon: "flag",
    },
  ];

  // --- Focus card: whichever single thing is actionable right now, spotlighted ---
  let focusCard: React.ReactNode;
  if (step2Locked) {
    focusCard = (
      <FocusCard tone="neutral" title="Set the project number" subtitle="Unlocks PBDB generation.">
        <ProjectNumberForm projectId={id} projectNumber={project.project_number} bare />
      </FocusCard>
    );
  } else if (pbdbFiles.length === 0) {
    focusCard = (
      <FocusCard id="pbdb-section" tone="neutral" title="Generate the PBDB" subtitle="Ready when you are.">
        <GeneratePbdbButton projectId={id} />
      </FocusCard>
    );
  } else if (pbdbCardState === "upload" && !project.pbdb_downloaded_at && latestPbdb) {
    // Just generated, not yet downloaded — confirm it worked and hand over the
    // file. The step advances to "Upload QA'd PBDB" the moment pbdb_downloaded_at
    // is set (by the download route, from here or the left-rail versions card):
    // RealtimeRefresh re-renders and re-derives this branch from server state.
    // No URL param / timers / overlay — the mechanism that used to wipe the old
    // spotlight now drives the transition.
    focusCard = (
      <FocusCard tone="green" title="Download the generated PBDB" subtitle="Fresh off generation — QA it, then upload the QA'd copy to send to stakeholders.">
        <GeneratedPbdbDownload
          projectId={id}
          fileId={latestPbdb.id as string}
          filename={latestPbdb.original_filename as string}
          version={latestPbdb.version as number}
          generatedDate={latestPbdb.created_at as string}
        />
      </FocusCard>
    );
  } else if (pbdbCardState === "upload") {
    focusCard = (
      <FocusCard tone="neutral" title="Upload QA'd PBDB" subtitle="Dispatches to stakeholders for review once uploaded.">
        <PbdbQaUploadForm projectId={id} />
      </FocusCard>
    );
  } else if (pbdbCardState === "pending") {
    focusCard = (
      <FocusCard
        tone="amber"
        title="Awaiting stakeholder review"
        subtitle={`${pendingCount} of ${currentCycleReviews.length} approvals outstanding.`}
      >
        <PbdbQaUploadForm
          projectId={id}
          submitLabel="Upload new version"
          requireConfirmation
          confirmCopy={UPLOAD_NEW_VERSION_COPY}
        >
          <RevisionNoteField
            reviewerNames={currentCycleReviews.map((r) => r.stakeholder_name)}
            required={project.clients?.revision_notes_required ?? false}
          />
        </PbdbQaUploadForm>
      </FocusCard>
    );
  } else if (pbdbCardState === "revision") {
    focusCard = (
      <FocusCard tone="red" title="Revision requested" subtitle="A stakeholder asked for changes.">
        <div className="space-y-4">
          {currentCycleComments.length > 0 && (
            <div className="space-y-3">
              {currentCycleComments.map((r) => (
                <div key={r.id} className="rounded-md border border-red-100 bg-red-50 px-4 py-3">
                  <p className="text-xs font-semibold text-red-800">{r.stakeholder_name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-red-700">{r.comments}</p>
                </div>
              ))}
            </div>
          )}
          <PbdbQaUploadForm
            projectId={id}
            submitLabel="Upload revised PBDB and re-submit to stakeholders"
            requireConfirmation
            confirmCopy={UPLOAD_NEW_VERSION_COPY}
          >
            <RevisionNoteField
              reviewerNames={currentCycleReviews.map((r) => r.stakeholder_name)}
              required={project.clients?.revision_notes_required ?? false}
            />
          </PbdbQaUploadForm>
        </div>
      </FocusCard>
    );
  } else if (project.status === "converting") {
    focusCard = (
      <FocusCard tone="green" title="Converting to PBDR" subtitle="All stakeholders approved — this happens automatically.">
        <p className="text-sm text-green-700">No action needed right now.</p>
      </FocusCard>
    );
  } else if (pbdrFiles.length > 0) {
    focusCard = (
      <FocusCard tone="green" title="Delivery ready" subtitle="Approved and converted — download or hand off below.">
        <div className="space-y-3">
          {pbdrFiles.map((f) => (
            <DownloadCard
              key={f.id as string}
              href={`/api/download/pbdr/${id}`}
              filename={f.original_filename as string}
              originalFilename={f.original_filename as string}
              wrapperClassName="flex items-center justify-between rounded-md border border-green-200 bg-white px-4 py-3"
              buttonClassName="shrink-0 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
            >
              <p className="text-sm font-medium text-zinc-900">PBDR</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                v{f.version as number} · {new Date(f.created_at as string).toLocaleDateString("en-AU")}
              </p>
            </DownloadCard>
          ))}
        </div>
      </FocusCard>
    );
  } else {
    focusCard = (
      <FocusCard tone="green" title="All approvals in" subtitle="Awaiting conversion to PBDR.">
        <p className="text-sm text-green-700">No action needed right now.</p>
      </FocusCard>
    );
  }

  // --- Left-rail extras: project number + PBDB stay reachable without a tab switch,
  // once they're no longer the spotlighted focus-card action. Keeps the "Dispatched
  // PBDB" badge and the #qa-pbdb-row scroll target that QaUploadedBanner needs —
  // both only work reliably here since this column is always mounted, unlike tabs.
  const leftRailExtras = (
    <>
      {!step2Locked && (
        <ProjectNumberCard projectId={id} projectNumber={project.project_number} />
      )}
      {pbdbFiles.length > 0 && (
        <PbdbVersionsCard
          id="pbdb-section"
          projectId={id}
          files={(
            pbdbFiles as {
              id: string;
              original_filename: string;
              version: number;
              review_cycle: number;
              created_at: string;
            }[]
          ).map((f) => ({ ...f, revisionNote: revisionNotesByCycle.get(f.review_cycle) ?? null }))}
          projectStatus={project.status}
          canRegenerate={canRegeneratePbdb}
        />
      )}
    </>
  );

  const detailsTab = (
    <>
      <ProjectDetailsEditor
        projectId={id}
        poNumber={project.po_number}
        fieldEntries={clientFieldEntries}
        orgEntries={orgTokenEntries}
        flagsByToken={flagsByToken}
      />
      <div className="px-1">
        <ReExtractButton projectId={id} />
      </div>
      <CollapsibleSection title="Client contact" defaultOpen>
        <div className="divide-y divide-zinc-100">
          {project.submitter ? (
            <>
              <Row
                label="Name"
                value={
                  [project.submitter.first_name, project.submitter.last_name]
                    .filter(Boolean).join(" ") || "—"
                }
              />
              <Row
                label="Email"
                value={
                  <a href={`mailto:${project.submitter.email}`} className="text-blue-600 hover:underline">
                    {project.submitter.email}
                  </a>
                }
              />
              {project.submitter.phone && (
                <Row
                  label="Phone"
                  value={
                    <a href={`tel:${project.submitter.phone}`} className="text-blue-600 hover:underline">
                      {project.submitter.phone}
                    </a>
                  }
                />
              )}
              {project.submitter.company_role && (
                <Row label="Role" value={project.submitter.company_role} />
              )}
              {project.clients?.state_territory && (
                <Row label="State / Territory" value={project.clients.state_territory} />
              )}
            </>
          ) : (
            <div className="px-5 py-4 text-sm text-zinc-400">
              No submitter on record — project may have been submitted via email.
            </div>
          )}
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="System values" defaultOpen={false}>
        <div className="divide-y divide-zinc-100">
          {sysValues.map(({ label, value }) => (
            <Row key={label} label={label} value={value} />
          ))}
        </div>
      </CollapsibleSection>
    </>
  );

  const documentsTab = (
    <>
      <CollapsibleSection title="Documents" defaultOpen>
        {submissionFiles.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-400">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {submissionFiles.map((f) => (
              <DownloadCard
                key={f.id as string}
                href={f.signedUrl}
                originalFilename={f.original_filename as string}
                external
              >
                <p className="text-sm font-medium text-zinc-900">
                  {fileReqLabelMap.get(f.file_type as string) ?? FILE_TYPE_LABELS[f.file_type as string] ?? (f.file_type as string)}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                </p>
                {!f.file_type_confirmed && (
                  <ConfirmFileTypeControl
                    projectId={id}
                    fileId={f.id as string}
                    currentFileType={f.file_type as string}
                  />
                )}
              </DownloadCard>
            ))}
          </div>
        )}
        <div className="border-t border-zinc-100 px-5 py-4">
          <FileUploadForm projectId={id} />
        </div>
      </CollapsibleSection>
      <CollapsibleSection
        title="Evidence & correspondence"
        subtitle="Forwarded emails, screenshots, or other proof attached to this project"
        defaultOpen={evidenceFiles.length > 0}
      >
        {evidenceFiles.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-400">No evidence attached yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {evidenceFiles.map((f) => (
              <DownloadCard
                key={f.id as string}
                href={f.signedUrl}
                originalFilename={f.original_filename as string}
                external
              >
                <p className="text-sm font-medium text-zinc-900">
                  {(f.reference as string | null) ?? "General correspondence"}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                </p>
              </DownloadCard>
            ))}
          </div>
        )}
        <div className="border-t border-zinc-100 px-5 py-4">
          <AttachEvidenceForm projectId={id} />
        </div>
      </CollapsibleSection>
      {/* PBDB versions + regenerate live in the left rail now (leftRailExtras below) —
          always visible there, not tucked behind this tab. */}
      {pbdrFiles.length > 0 && (
        <CollapsibleSection title="PBDR" subtitle="Final converted document delivered to the client." defaultOpen>
          <div className="divide-y divide-zinc-100">
            {pbdrFiles.map((f) => (
              <DownloadCard
                key={f.id as string}
                href={`/api/download/pbdr/${id}`}
                filename={f.original_filename as string}
                originalFilename={f.original_filename as string}
              >
                <p className="text-sm font-medium text-zinc-900">PBDR</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Version {f.version as number} ·{" "}
                  {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                </p>
              </DownloadCard>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </>
  );

  const stakeholdersTab =
    allReviews.length === 0 ? (
      <p className="px-1 py-4 text-sm text-zinc-400">No stakeholder reviews yet.</p>
    ) : (
      <CollapsibleSection
        title="Stakeholder reviews"
        subtitle="All review cycles — each cycle corresponds to one version of the PBDB sent to stakeholders."
        defaultOpen
      >
        {reviewCycles.map((cycle) => {
          const cycleReviews = reviewsByCycle.get(cycle)!;
          const pbdbForCycle = pbdbFiles.find((f) => (f.review_cycle as number) === cycle);
          const isCurrent = cycle === project.review_cycle;
          return (
            <div key={cycle} className="border-b border-zinc-100 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2 bg-zinc-50 px-5 py-2.5">
                <span className="text-xs font-semibold text-zinc-700">Cycle {cycle}</span>
                {pbdbForCycle ? (
                  <span className="text-xs text-zinc-400">
                    · PBDB v{pbdbForCycle.version as number}
                    · {new Date(pbdbForCycle.created_at as string).toLocaleDateString("en-AU")}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-400">· No PBDB for this cycle</span>
                )}
                {isCurrent && (
                  <span className="ml-auto rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Current
                  </span>
                )}
              </div>
              <div className="divide-y divide-zinc-50">
                {cycleReviews.map((r) => {
                  const statusConfig = {
                    pending: { label: "Pending", cls: "bg-amber-100 text-amber-700" },
                    approved_without_comments: { label: "Approved", cls: "bg-green-100 text-green-700" },
                    approved_with_comments: { label: "Approved with notes", cls: "bg-green-100 text-green-700" },
                    rejected_with_comments: { label: "Rejected", cls: "bg-red-100 text-red-700" },
                    waived: { label: "Waived", cls: "bg-zinc-100 text-zinc-500" },
                  }[r.status] ?? { label: r.status, cls: "bg-zinc-100 text-zinc-500" };
                  const canLogOnBehalf =
                    isCurrent && r.status === "pending" && project.status === "dispatched";
                  const emailReplyEvidence = evidenceByReviewId.get(r.id);
                  return (
                    <div key={r.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900">{r.stakeholder_name}</p>
                          <p className="text-xs text-zinc-500">{r.stakeholder_email}</p>
                          {r.comments && (
                            <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">{r.comments}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          <div className="text-right">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.cls}`}>
                              {statusConfig.label}
                            </span>
                            {r.responded_at && (
                              <p className="mt-0.5 text-xs text-zinc-400">
                                {new Date(r.responded_at).toLocaleDateString("en-AU", {
                                  day: "numeric", month: "short", year: "numeric",
                                })}
                              </p>
                            )}
                          </div>
                          {canLogOnBehalf && (
                            <LogStakeholderResponseForm
                              reviewId={r.id}
                              projectId={id}
                              stakeholderName={r.stakeholder_name}
                              stakeholderEmail={r.stakeholder_email}
                              prefilledEvidence={
                                emailReplyEvidence
                                  ? {
                                      storagePath: emailReplyEvidence.storage_path as string,
                                      filename: emailReplyEvidence.original_filename as string,
                                    }
                                  : undefined
                              }
                              prefilledComments={r.email_reply_text ?? undefined}
                            />
                          )}
                        </div>
                      </div>
                      {r.email_reply_text && (
                        <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-amber-800">Replied by email — needs action</p>
                            {r.email_reply_sender_verified === false && (
                              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                Unverified sender
                              </span>
                            )}
                            {r.email_reply_received_at && (
                              <span className="text-[10px] text-amber-600">
                                {new Date(r.email_reply_received_at).toLocaleString("en-AU", {
                                  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                                })}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-amber-900">
                            {r.email_reply_text}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CollapsibleSection>
    );

  const settingsContent = (
    <>
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">Delivery timing</h3>
        <p className="mt-1 mb-3 text-xs leading-relaxed text-zinc-500">
          Sets how long to wait after every stakeholder approves before the final report (PBDR)
          goes out to the client.
        </p>
        <ProjectDeliveryDelayPresetSelect
          projectId={id}
          initialValue={project.delivery_delay_preset}
          durations={deliveryDurations}
        />
        {deliveryLocked ? (
          <p className="mt-2.5 rounded-md bg-zinc-50 px-2.5 py-2 text-[11px] leading-relaxed text-zinc-500">
            All stakeholders already approved, so this delivery is using whatever was set
            beforehand — changing it now won&apos;t affect this PBDR.
          </p>
        ) : (
          <p className="mt-2.5 rounded-md bg-amber-50 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700">
            Set this before the last stakeholder approves — it locks in at that point and can&apos;t
            be changed retroactively.
          </p>
        )}
      </div>
      {pendingDelivery && (
        <div className="border-t border-zinc-100 pt-3">
          <PendingDeliveryPanel projectId={id} scheduledFor={pendingDelivery.scheduled_for as string} />
        </div>
      )}
      {latestPbdb && (
        <div className="border-t border-zinc-100 pt-3">
          <p className="text-xs font-medium text-zinc-600">Client document colour</p>
          <p className="mt-1 mb-2 text-xs text-zinc-400">
            Black text, or the original red token colour, when the client downloads the PBDB.
          </p>
          <ProjectStripColorToggle projectId={id} initialValue={project.strip_token_color} />
        </div>
      )}
    </>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {justPickedUp && <PickedUpBanner projectId={id} />}
      {justUploadedQa && <QaUploadedBanner cleanUrl={`/ops/projects/${id}`} />}
      {justQueueApproved && (
        <AdminSuccessBanner
          cleanUrl={`/ops/projects/${id}`}
          title="Submission approved"
          body="Please confirm the document types flagged below before continuing."
        />
      )}
      <Link href="/ops" className="text-sm text-zinc-500 hover:text-zinc-700">
        ← My projects
      </Link>
      <AltWorkspace
        header={altHeaderCard}
        stages={stageList}
        focusCard={focusCard}
        leftRailExtras={leftRailExtras}
        detailsTab={detailsTab}
        documentsTab={documentsTab}
        stakeholdersTab={stakeholdersTab}
        settingsContent={settingsContent}
        auditTab={auditTab}
        defaultRefTab={justQueueApproved ? "documents" : undefined}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 px-5 py-3">
      <span className="w-36 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">{value}</span>
    </div>
  );
}
