import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBusinessTimezone } from "@/lib/settings/timezone";
import { prettifyToken } from "@/lib/tokens/prettify";
import { getDeliveryDelayDurations } from "@/lib/settings/delivery-delay";
import { previewNextSendTime } from "@/lib/documents/pending-delivery";
import { getCurrentRevNumber, getLatestRevisionHistoryRow } from "@/lib/documents/revision-history";
import { groupPbdbVersions } from "@/lib/documents/pbdb-versions";
import { groupPbdrVersions } from "@/lib/documents/pbdr-versions";
import { deriveRoundStatus } from "@/lib/stakeholders/review-round";
import { classifyPbdbDispatchReadiness } from "@/lib/stakeholders/dispatch-readiness";
import { resolveStaffStatus } from "@/lib/delivery/effective-status";
import { summarizeRound } from "@/lib/stakeholders/round-summary";
import { PROJECT_AUDIT_EXCLUDED_EVENTS } from "@/lib/audit/project-scope";
import type { DeliveryDelayPreset } from "@/lib/delivery/delivery-delay";
import type { ProjectStatus, ConsultantAvailability } from "@/types";

import { ProjectStripColorToggle } from "@/components/ProjectStripColorToggle";
import { ProjectDeliveryDelayPresetSelect } from "@/components/ProjectDeliveryDelayPresetSelect";
import { PendingDeliveryPanel } from "@/components/PendingDeliveryPanel";
import { DownloadCard } from "@/components/DownloadCard";
import { FilePreviewButton } from "@/components/FilePreviewButton";
import { ConfirmFileTypeControl } from "@/components/ConfirmFileTypeControl";
import { AttachEvidenceForm } from "@/components/AttachEvidenceForm";
import { GeneratePbdbButton } from "@/components/PbdbGenerationButtons";
import { GeneratedPbdbDownload } from "@/components/GeneratedPbdbDownload";
import { AdminSuccessBanner } from "@/components/AdminSuccessBanner";
import { ReviewTallyChip } from "@/components/ReviewTallyChip";
import { NumberSavedBanner } from "@/components/NumberSavedBanner";
import { PbdbGeneratedBanner } from "@/components/PbdbGeneratedBanner";
import { RevisionTablePatchWarningBanner } from "@/components/RevisionTablePatchWarningBanner";
import { DownloadRevisedPbdbButton } from "@/components/DownloadRevisedPbdbButton";
import { ReExtractButton } from "@/components/ReExtractButton";
import { VerificationMismatchNote } from "@/components/VerificationMismatchNote";
import { RealtimeSubscriptionRefresher } from "@/components/RealtimeSubscriptionRefresher";
import { FocusCard } from "@/components/workspace/FocusCard";
import type { Stage } from "@/components/workspace/StageRail";
import { PickedUpBanner } from "@/app/(consultant)/ops/_components/PickedUpBanner";

import { FileUploadForm } from "@/app/(consultant)/ops/projects/[id]/_components/FileUploadForm";
import { ProjectNumberForm } from "@/app/(consultant)/ops/projects/[id]/_components/ProjectNumberForm";
import { PbdbQaUploadForm } from "@/app/(consultant)/ops/projects/[id]/_components/PbdbQaUploadForm";
import { PbdbReuploadToggle } from "@/app/(consultant)/ops/projects/[id]/_components/PbdbReuploadToggle";
import { PbdbSendPreview } from "@/app/(consultant)/ops/projects/[id]/_components/PbdbSendPreview";
import { QaUploadedBanner } from "@/app/(consultant)/ops/projects/[id]/_components/QaUploadedBanner";
import { CollapsibleSection } from "@/app/(consultant)/ops/projects/[id]/_components/CollapsibleSection";
import { ProjectDetailsEditor, type OpenFieldFlag } from "@/app/(consultant)/ops/projects/[id]/_components/ProjectDetailsEditor";
import { FlagAcknowledgeControl } from "@/app/(consultant)/ops/projects/[id]/_components/FlagAcknowledgeControl";
import { ProjectAuditTrail, type ProjectAuditRow } from "@/app/(consultant)/ops/projects/[id]/_components/ProjectAuditTrail";
import { PendingReviewCard } from "@/app/(consultant)/ops/projects/[id]/_components/PendingReviewCard";
import { ReviewResponseControl } from "@/app/(consultant)/ops/projects/[id]/_components/ReviewResponseControl";
import { HeaderStatInline } from "@/app/(consultant)/ops/projects/[id]/_components/HeaderStatInline";
import { AltWorkspace } from "@/app/(consultant)/ops/projects/[id]/_components/AltWorkspace";
import { RevisionNoteField } from "@/app/(consultant)/ops/projects/[id]/_components/RevisionNoteField";
import { ProjectNumberCard } from "@/app/(consultant)/ops/projects/[id]/_components/ProjectNumberCard";
import { PbdbVersionsCard } from "@/app/(consultant)/ops/projects/[id]/_components/PbdbVersionsCard";
import { VersionTiers } from "@/app/_shared/project-detail/VersionTiers";
import { ResendBufferUpdateButton } from "@/app/(consultant)/ops/projects/[id]/_components/ResendBufferUpdateButton";

import { ResendPbdrButton } from "@/app/(admin)/admin/projects/[id]/_components/ResendPbdrButton";
import { RevertButton } from "@/app/(admin)/admin/projects/[id]/_components/RevertButton";
import { ConvertButton } from "@/app/(admin)/admin/projects/[id]/_components/ConvertButton";
import { PbdrPreviewButton } from "@/app/(admin)/admin/projects/[id]/_components/PbdrPreviewButton";
import { DispatchButton } from "@/app/(admin)/admin/projects/[id]/_components/DispatchButton";
import { PbdbDispatchSchedule } from "@/app/(admin)/admin/projects/[id]/_components/PbdbDispatchSchedule";
import { AssignForm, type ConsultantOption } from "@/app/(admin)/admin/projects/[id]/_components/AssignForm";
import { OverrideForm } from "@/app/(admin)/admin/projects/[id]/_components/OverrideForm";
import { ProjectStakeholderSection } from "@/app/(admin)/admin/projects/[id]/_components/ProjectStakeholderSection";
import { PauseForm } from "@/app/(admin)/admin/projects/[id]/_components/PauseForm";
import { ResumeButton } from "@/app/(admin)/admin/projects/[id]/_components/ResumeButton";
import { AdminDeleteButton } from "@/app/(admin)/admin/projects/[id]/_components/AdminDeleteButton";
import { AdminProjectNumberForm } from "@/app/(admin)/admin/projects/[id]/_components/AdminProjectNumberForm";
import { ConsultantCard } from "@/app/(admin)/admin/projects/[id]/_components/ConsultantCard";
import { OverduePill } from "@/components/OverduePill";
import { daysOverdue as daysOverdueBetween } from "@/app/(consultant)/ops/_components/dashboardList";

export type ProjectWorkspaceRole = "consultant" | "admin";

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
  assigned: "bg-zinc-200 text-zinc-700",
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
  assigned: "border-l-zinc-400",
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

const ADMIN_LIVE_STATUSES: readonly ProjectStatus[] = [
  "submitted", "assigned", "in_progress", "dispatched", "revision_required",
];

function adminOverdueInfo(
  deliveryDate: string | null,
  status: ProjectStatus,
  isDeleted: boolean,
): { isOverdue: boolean; daysOverdue: number } {
  if (isDeleted || !deliveryDate || !ADMIN_LIVE_STATUSES.includes(status))
    return { isOverdue: false, daysOverdue: 0 };
  // Whole calendar days past the delivery date, the same rule the consultant
  // dashboard uses, so an admin and a consultant see the same project as
  // overdue on the same day with the same count.
  const days = daysOverdueBetween(deliveryDate, new Date().toISOString().slice(0, 10));
  return { isOverdue: days > 0, daysOverdue: days };
}

function calcDaysPaused(pausedAt: string | null): number {
  if (!pausedAt) return 0;
  return Math.ceil((Date.now() - new Date(pausedAt).getTime()) / (1000 * 60 * 60 * 24));
}

const fmtDMY = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

const NO_ROWS = Promise.resolve({ data: [] as never[] });

/**
 * The single project-details page composition, shared by the consultant
 * (/ops/projects/[id]) and admin (/admin/projects/[id]) routes. The route
 * files own authentication and pass `role`; everything role-specific below is
 * an additive slot (admin-only actions) or a query-scope difference — the
 * Right Now card, stage rail, tabs and every document listing are one
 * implementation, so admin sees exactly what a consultant sees.
 */
export async function ProjectWorkspace({
  id,
  searchParams: sp,
  role,
  userId,
}: {
  id: string;
  searchParams: Record<string, string>;
  role: ProjectWorkspaceRole;
  /** Required for role "consultant" — scopes the project to their assignment. */
  userId?: string;
}) {
  const isAdmin = role === "admin";
  const basePath = isAdmin ? `/admin/projects/${id}` : `/ops/projects/${id}`;

  const justPickedUp = sp.picked_up === "1";
  const justUploadedQa = sp.qa_uploaded === "1";
  const revisionTableWarning = sp.revision_table_warning ?? null;
  const justQueueApproved = sp.queue_approved === "1";
  const justPbdrResent = sp.pbdr_resent === "1";
  const justReviewWaived = sp.review_waived === "1";
  const justEmailUpdated = sp.email_updated ?? null;
  const justSavedNumber = sp.number_saved === "1";
  const justAssigned = sp.assigned === "1";
  const justPaused = sp.paused === "1";
  const justResumed = sp.resumed === "1";
  const justPaymentOverridden = sp.payment_overridden === "1";
  const justPaymentReconciled = sp.payment_reconciled === "1";
  const justGeneratedPbdb = sp.pbdb_generated === "1";

  const supabase = createAdminClient();

  const projectQuery = supabase
    .from("projects")
    .select(
      `id, extracted_fields, status, po_number, project_number, template_id, review_cycle, created_at, expected_delivery_date, source, strip_token_color, delivery_delay_preset, pbdb_delivery_delay_preset, delivery_recipient_email, qa_completed_by, accepted_at, pbdb_downloaded_at, credit_deducted, payment_override, payment_override_reason, payment_override_at, deleted_at, clients(id, name, state_territory, client_config, revision_notes_required), assigned:users!projects_assigned_consultant_id_fkey(id, first_name, last_name, email, availability), submitter:users!projects_submitted_by_fkey(id, first_name, last_name, email, phone, company_role)`
    )
    .eq("id", id);
  // The two settings lookups don't depend on the project, so they run with the
  // project query instead of ahead of / after it (each is a database round trip).
  const [businessTimezone, deliveryDurations, { data, error }] = await Promise.all([
    getBusinessTimezone(supabase),
    getDeliveryDelayDurations(supabase),
    isAdmin
      ? projectQuery.maybeSingle()
      : projectQuery.eq("assigned_consultant_id", userId ?? "").maybeSingle(),
  ]);

  if (error) console.error(`[${role}/projects/${id}] project query failed:`, error);
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
    pbdb_delivery_delay_preset: DeliveryDelayPreset;
    delivery_recipient_email: string | null;
    qa_completed_by: string | null;
    accepted_at: string | null;
    pbdb_downloaded_at: string | null;
    credit_deducted: boolean;
    payment_override: boolean;
    payment_override_reason: string | null;
    payment_override_at: string | null;
    deleted_at: string | null;
    clients: {
      id: string;
      name: string;
      state_territory: string | null;
      client_config: Record<string, string>;
      revision_notes_required: boolean;
    } | null;
    assigned: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      email: string;
      availability: ConsultantAvailability;
    } | null;
    submitter: {
      id: string;
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
  if (!isAdmin && !project.accepted_at) {
    redirect("/ops");
  }

  const isDeleted = isAdmin && !!project.deleted_at;

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
    { data: pendingPbdbDelivery },
    { data: openFieldFlags },
    { data: rawConsultants },
    { data: rawPauseData },
    { data: rawProjectStakeholders },
    { data: rawAssignments },
    { data: rawTemplateRequired },
    { data: rawOrgRoster },
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
      .select(
        "id, file_type, file_type_confirmed, original_filename, storage_path, created_at, verification_mismatch_reasons, verification_confirmed_at"
      )
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
      .select(
        "id, original_filename, storage_path, version, review_cycle, created_at, filename_mismatch_reason, structure_scan_findings, qa_flags_acknowledged_at"
      )
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
        "id, stakeholder_name, stakeholder_email, status, comments, responded_at, review_cycle, email_reply_text, email_reply_received_at, email_reply_sender_verified, round_status, response_mode, respondent_name, waive_reason"
      )
      .eq("project_id", id)
      .order("review_cycle", { ascending: false })
      .order(isAdmin ? "created_at" : "responded_at", { ascending: true }),
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
    supabase.from("pending_deliveries").select("scheduled_for").eq("project_id", id).eq("delivery_type", "pbdr").maybeSingle(),
    supabase.from("pending_deliveries").select("scheduled_for").eq("project_id", id).eq("delivery_type", "pbdb").maybeSingle(),
    supabase
      .from("field_flags")
      .select(
        "id, field_key, candidate_values, type, status, current_value, resolved_by, resolved_at, consultant_acknowledged_by, consultant_acknowledged_at"
      )
      .eq("project_id", id),
    // Admin-only slots: consultant assignment, pause state, reviewer roster.
    isAdmin
      ? supabase
          .from("users")
          .select("id, first_name, last_name, email, availability")
          .eq("role", "consultant")
          .eq("is_locked", false)
          .order("first_name")
      : NO_ROWS,
    isAdmin && project.status === "paused"
      ? supabase
          .from("projects")
          .select("paused_at, paused_previous_status, pause_reason")
          .eq("id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    isAdmin
      ? supabase
          .from("stakeholders")
          .select("id, name, email, company")
          .eq("scope", "project")
          .eq("scope_id", id)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true })
      : NO_ROWS,
    isAdmin
      ? supabase
          .from("audit_log")
          .select("metadata, created_at")
          .eq("project_id", id)
          .eq("event_type", "assignment.created")
          .order("created_at", { ascending: true })
      : NO_ROWS,
    isAdmin && project.template_id
      ? supabase
          .from("template_stakeholders")
          .select("stakeholders(id, name, email, company, is_active, deleted_at)")
          .eq("template_id", project.template_id)
      : NO_ROWS,
    isAdmin && project.clients?.id
      ? supabase
          .from("stakeholders")
          .select("id, name, email, company")
          .eq("scope", "org")
          .eq("scope_id", project.clients.id)
          .is("deleted_at", null)
          .order("sort_order", { ascending: true })
      : NO_ROWS,
  ]);

  const consultants = (rawConsultants ?? []) as unknown as ConsultantOption[];
  const pauseData = (rawPauseData ?? { paused_at: null, paused_previous_status: null, pause_reason: null }) as unknown as {
    paused_at: string | null;
    paused_previous_status: string | null;
    pause_reason: string | null;
  };
  const projectStakeholders = (rawProjectStakeholders ?? []) as unknown as {
    id: string; name: string; email: string; company: string | null;
  }[];
  const templateRequiredStakeholders = (
    (rawTemplateRequired ?? []) as unknown as {
      stakeholders: { id: string; name: string; email: string; company: string | null; is_active: boolean; deleted_at: string | null }[];
    }[]
  )
    .flatMap((r) => r.stakeholders)
    .filter((s) => s.is_active && !s.deleted_at)
    .map(({ id, name, email, company }) => ({ id, name, email, company }));
  const orgRoster = (rawOrgRoster ?? []) as unknown as {
    id: string; name: string; email: string; company: string | null;
  }[];

  type AssignmentEvent = { consultant_id: string; consultant_name: string; project_status?: string };
  const assignmentHistory = ((rawAssignments ?? []) as unknown as { metadata: unknown; created_at: string }[])
    .map((row) => {
      const meta = row.metadata as AssignmentEvent | null;
      return meta?.consultant_id
        ? {
            consultantId: meta.consultant_id,
            consultantName: meta.consultant_name,
            assignedAt: row.created_at,
            projectStatusAtAssignment: meta.project_status ?? null,
          }
        : null;
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const allFieldFlags = openFieldFlags ?? [];

  // Signing file URLs only needs the file rows, so start it now and let it run
  // while the flag-actor lookup below waits on its own round trip.
  const signedFilesPromise = Promise.all([
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

  const flagActorIds = [
    ...new Set(
      allFieldFlags
        .flatMap((f) => [f.resolved_by as string | null, f.consultant_acknowledged_by as string | null])
        .filter((v): v is string => !!v)
    ),
  ];
  const { data: flagActors } = flagActorIds.length
    ? await supabase.from("users").select("id, email").in("id", flagActorIds)
    : { data: [] };
  const flagActorEmailById = new Map(
    (flagActors ?? []).map((u) => [u.id as string, u.email as string])
  );

  // Every flag regardless of status (#105) — a resolved flag still renders
  // inline in Submitted details, read-only with its full candidate list.
  const flagsByToken: Record<string, OpenFieldFlag> = Object.fromEntries(
    allFieldFlags.map((f) => [
      f.field_key as string,
      {
        id: f.id as string,
        candidates: (f.candidate_values ?? []) as OpenFieldFlag["candidates"],
        type: f.type as OpenFieldFlag["type"],
        status: f.status as OpenFieldFlag["status"],
        resolvedByEmail: f.resolved_by ? flagActorEmailById.get(f.resolved_by as string) ?? null : null,
        resolvedAt: f.resolved_at as string | null,
        acknowledgedByEmail: f.consultant_acknowledged_by
          ? flagActorEmailById.get(f.consultant_acknowledged_by as string) ?? null
          : null,
        acknowledgedAt: f.consultant_acknowledged_at as string | null,
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

  const [submissionFiles, evidenceFiles, pbdrFiles] = await signedFilesPromise;

  const pbdbFiles = rawPbdbFiles ?? [];
  const latestPbdb = pbdbFiles[pbdbFiles.length - 1] ?? null;

  // Findings gate before Send (#112): deterministic structure scan, surfaced
  // on the latest pbdb file row. Acknowledgment is scoped to that exact
  // row/version, never carried over from a prior upload. The filename
  // mismatch (#109) is shown separately as an editable, non-blocking field
  // (see PbdbSendPreview) since the dispatched filename is always
  // system-generated regardless of what was uploaded.
  const pbdbSendFindings: string[] = latestPbdb
    ? ((latestPbdb.structure_scan_findings as { message: string }[] | null)?.map((f) => f.message) ?? [])
    : [];
  const pbdbFlagsAcknowledged = !!latestPbdb?.qa_flags_acknowledged_at;
  const pbdbReadyToSend = pbdbSendFindings.length === 0 || pbdbFlagsAcknowledged;

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
    round_status: string; response_mode: string | null; respondent_name: string | null;
    waive_reason: string | null;
  };
  const allReviews = (rawReviews ?? []) as ReviewRow[];
  // Known stakeholder roster for the Respondent dropdown (#111) — everyone
  // who has ever had a review row on this project, deduped by email.
  const stakeholderRoster = [
    ...new Map(
      allReviews.map((r) => [r.stakeholder_email.toLowerCase(), { name: r.stakeholder_name, email: r.stakeholder_email }])
    ).values(),
  ];
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

  // #114: flags surfaced at job pickup — acknowledgment is independent of
  // resolution status (#105), so this includes both open and already-
  // resolved flags, same set the "Submitted details" section tracks. A flag
  // whose value came from the stakeholder typing it in directly (no
  // extraction evidence to check it against) never needed a consultant's
  // acknowledgment in the first place — submission.ts's auto-resolve sets
  // consultant_acknowledged_at for exactly that case, so it's already
  // excluded here without this list needing to know why.
  const unacknowledgedFlags = Object.entries(flagsByToken)
    .filter(([, flag]) => !flag.acknowledgedAt)
    .map(([token, flag]) => ({ token, label: labelMap.get(token) ?? prettifyToken(token), flag }));

  // Extraction candidates key `source_document` by the file's requirement
  // label (e.g. "Purchase Order"), not its original filename — extraction
  // labels documents by slot/type, not by whatever the stakeholder named the
  // file (see app/actions/submission.ts's extraction-document labeling).
  // Match on that same label so a candidate's source resolves to the right
  // uploaded file's signed URL.
  const sourceUrlsByFilename: Record<string, string | null> = Object.fromEntries([
    ...submissionFiles.map((f) => [
      fileReqLabelMap.get(f.file_type as string) ?? FILE_TYPE_LABELS[f.file_type as string] ?? (f.file_type as string),
      f.signedUrl,
    ]),
    ...evidenceFiles.map((f) => ["Evidence", f.signedUrl]),
  ]);

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

  const latestGenDate = latestPbdb ? new Date(latestPbdb.created_at as string) : null;
  // Rev number is owned by revision_history (#175) — an `initial` row is
  // Rev 0, each `rejected` cycle bumps it. `project_files.version` counts
  // regenerations within a cycle and must NOT be used to derive the Rev
  // (the old `latestPbdb.version - 1` formula drifted every regenerate).
  // That regeneration counter is deliberately not surfaced anywhere in the
  // UI — Rev is the only version number a user should ever see.
  const [currentRevNumber, latestPbdbRevisionRow, pbdbSendPreview, pbdrSendPreview, { data: rawRevisionRows }] = await Promise.all([
    getCurrentRevNumber(supabase, id, "pbdb"),
    // #195: whether the consultant has downloaded the revision-populated
    // working copy for the *current* revision yet.
    getLatestRevisionHistoryRow(supabase, id, "pbdb"),
    // Projected "send date" beside the delivery-timing controls (#176) — the
    // contractual due date (project.expected_delivery_date) is a different
    // thing and testers were reading the two as one.
    previewNextSendTime(id, "pbdb").catch(() => null),
    previewNextSendTime(id, "pbdr").catch(() => null),
    supabase
      .from("revision_history")
      .select("doc_type, event, rev_number, review_cycle, created_at")
      .eq("project_id", id),
  ]);
  const revisionRows = (rawRevisionRows ?? []) as {
    doc_type: string;
    event: string;
    rev_number: number;
    review_cycle: number | null;
    created_at: string;
  }[];
  const pbdbGrouping = groupPbdbVersions({
    files: pbdbFiles as {
      id: string;
      original_filename: string;
      version: number;
      review_cycle: number;
      created_at: string;
    }[],
    reviews: allReviews,
    revisionHistory: revisionRows.filter((r) => r.doc_type === "pbdb"),
    revisionNotesByCycle,
  });
  const pbdrGrouping = groupPbdrVersions({
    files: pbdrFiles as { id: string; original_filename: string; version: number; created_at: string }[],
    revisionHistory: revisionRows,
  });
  const pbdbSendPreviewIso = pbdbSendPreview ? pbdbSendPreview.toISOString() : undefined;
  const pbdrSendPreviewIso = pbdrSendPreview ? pbdrSendPreview.toISOString() : undefined;
  // #176: the explanation for each value lives in a hover hint on the row,
  // not trailing the value inline.
  const sysValues: { label: string; value: string; hint?: string }[] = [
    {
      label: "Project number",
      value: project.project_number ? `${project.project_number}-S` : "Not yet set",
      hint: "The DDEG project number. It isn't unique across projects — check the site address to confirm this is the right job.",
    },
    {
      label: "Submission date",
      value: fmtDMY(new Date(project.created_at)),
      hint: "When the client submitted this project.",
    },
    {
      label: "Generation date",
      value: latestGenDate ? fmtDMY(latestGenDate) : "Not yet generated",
      hint: "When the current PBDB file was last generated.",
    },
    {
      label: "Revision",
      value: `Rev ${currentRevNumber}`,
      hint: "Bumps only when a stakeholder rejects and a corrected PBDB goes back out.",
    },
  ];

  const addr = (project.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ?? null;
  const title = (project.project_number && addr)
    ? `${project.project_number} — ${addr}`
    : addr ?? (project.po_number ? `PO ${project.po_number}` : project.id.slice(0, 8));

  const assignedName = project.assigned
    ? [project.assigned.first_name, project.assigned.last_name].filter(Boolean).join(" ") || project.assigned.email
    : null;
  const submitterName = project.submitter
    ? [project.submitter.first_name, project.submitter.last_name].filter(Boolean).join(" ") || project.submitter.email
    : null;

  // Step states
  const isTerminal = TERMINAL_STATUSES.has(project.status) || project.status === "converting";
  const step2Locked = !project.project_number;
  const canRegeneratePbdb = (["assigned", "in_progress"] as ProjectStatus[]).includes(project.status);

  const currentCycleReviews = reviewsByCycle.get(project.review_cycle) ?? [];
  const currentCycleComments = currentCycleReviews.filter((r) => r.comments);

  // #193: on a redispatch, the current cycle's rows don't exist yet (they're
  // created on send) — the reviewers being reset are the previous cycle's.
  const previousCycleReviews = reviewsByCycle.get(project.review_cycle - 1) ?? [];
  const redispatchResetWarning =
    previousCycleReviews.length > 0
      ? {
          totalStakeholders: previousCycleReviews.length,
          previouslyApprovedCount: previousCycleReviews.filter(
            (r) => r.status === "approved_without_comments" || r.status === "approved_with_comments"
          ).length,
        }
      : undefined;
  const pendingReviews = currentCycleReviews.filter((r) => r.status === "pending");
  const pendingCount = pendingReviews.length;
  // #191/#192: the current round's status gates correcting a logged response.
  const currentRoundStatus = deriveRoundStatus(currentCycleReviews);
  // #195: once the round has actually closed rejected (not just "someone
  // rejected, others still pending" — that's the pendingReviews branch
  // above), the #194 download route serves a revision-populated copy. Show
  // the download step first, ahead of the upload form, until it's grabbed.
  const workingPbdbNeedsDownload =
    currentRoundStatus === "closed_rejected" && !latestPbdbRevisionRow?.working_pbdb_downloaded_at;
  // Who logged each review's latest response on the stakeholder's behalf —
  // shown when a consultant opens it to replace it (#192).
  const loggedByByReviewId = new Map<string, string | null>();
  for (const e of rawAuditEntries ?? []) {
    if (e.event_type !== "stakeholder.responded_on_behalf" && e.event_type !== "stakeholder.response_replaced") continue;
    const reviewId = (e.metadata as { review_id?: string } | null)?.review_id;
    if (reviewId) loggedByByReviewId.set(reviewId, (e.actor_email as string | null) ?? null);
  }
  // Single source of truth for "what stage is this project really at" —
  // collapses dispatched+all-approved into "converting" the same way every
  // other surface (dashboard lists, client portal, stepper) does, instead of
  // this page recomputing its own version of the same check.
  // The stored status flips to revision_required on the first rejection even
  // while other reviewers are pending; staff see it as still awaiting
  // stakeholders until the round actually closes.
  const effectiveStatus = resolveStaffStatus(project.status, currentCycleReviews);
  const roundSummary = summarizeRound(currentCycleReviews);

  // Shared dispatch-readiness rule (#168) — the same classifier the
  // `dispatchToStakeholders` server action uses, so the card and the action
  // can't disagree about whether a (re)dispatch is possible. "redispatch"
  // also covers `dispatched` / `revision_required` + 0 current-cycle rows:
  // a fresh revised upload awaiting redispatch, or a project stranded by the
  // #166 outage.
  const dispatchReadiness = classifyPbdbDispatchReadiness({
    status: effectiveStatus,
    qaCompletedBy: project.qa_completed_by,
    currentCycleReviewCount: currentCycleReviews.length,
  });

  const pbdbCardState: "locked" | "upload" | "ready_to_dispatch" | "pending" | "revision" | "ready_to_redispatch" | "approved" = !latestPbdb
    ? "locked"
    : dispatchReadiness.kind === "redispatch"
    ? "ready_to_redispatch"
    : effectiveStatus === "dispatched"
    ? "pending"
    : effectiveStatus === "revision_required"
    ? "revision"
    : isTerminal || effectiveStatus === "converting"
    ? "approved"
    : dispatchReadiness.kind === "initial"
    ? "ready_to_dispatch"
    : "upload";

  const { isOverdue, daysOverdue } = isAdmin
    ? adminOverdueInfo(project.expected_delivery_date, project.status, isDeleted)
    : {
        isOverdue:
          !!project.expected_delivery_date &&
          project.expected_delivery_date < todayIso &&
          !TERMINAL_STATUSES.has(project.status),
        daysOverdue: 0,
      };
  const daysPaused = calcDaysPaused(pauseData.paused_at);
  const overdueDays = isAdmin ? daysOverdue : isOverdue ? daysOverdueBetween(project.expected_delivery_date, todayIso) : 0;

  const headerCard = (
    <div className={`rounded-xl border border-zinc-200 border-l-[3px] ${STATUS_ACCENT[effectiveStatus]} bg-white p-5`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h1 className="text-balance text-base font-semibold tracking-tight text-zinc-900">{title}</h1>
        <span className="text-sm text-zinc-500">{project.clients?.name ?? "No organisation"}</span>
        <span className={`self-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[effectiveStatus]}`}>
          {STATUS_LABELS[effectiveStatus]}
        </span>
        {(effectiveStatus === "dispatched" || effectiveStatus === "revision_required") && (
          <ReviewTallyChip summary={roundSummary} className="self-center" />
        )}
        <span className={`self-center inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          project.source === "email" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
        }`}>
          {project.source === "email" ? "Email" : "Portal"}
        </span>
        {isAdmin && project.payment_override && (
          <span className="self-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Override — Payment Pending
          </span>
        )}
        {isOverdue && (
          <OverduePill className="self-center" days={overdueDays} />
        )}
        {isDeleted && (
          <span className="self-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
            Deleted
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-1.5 border-t border-zinc-100 pt-3 text-sm">
        <span
          className="inline-flex items-center gap-1 cursor-help text-zinc-500"
          title={`Revision ${currentRevNumber} — bumps only when a stakeholder rejects and a corrected PBDB goes back out.`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 002.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0112.888 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
          </svg>
          <span className="font-medium text-zinc-900">Rev {currentRevNumber}</span>
        </span>
        {isAdmin && (
          <HeaderStatInline
            label="Assigned"
            value={assignedName ?? "Unassigned"}
            valueClassName={assignedName ? undefined : "text-amber-700"}
            noLeftBorder
          />
        )}
        <HeaderStatInline
          label="Submitted"
          value={fmtDMY(new Date(project.created_at))}
          title="When the client submitted this project."
          noLeftBorder={!isAdmin}
        />
        <HeaderStatInline
          label="Due"
          value={project.expected_delivery_date ? fmtDMY(new Date(project.expected_delivery_date)) : "—"}
          valueClassName={isOverdue ? "text-red-600" : undefined}
          title="The PBDR's contractual due date — separate from the PBDB/PBDR send date, which the delivery-timing control sets."
        />
        <HeaderStatInline
          value={project.project_number ? `#${project.project_number}-S` : "Project number not yet set"}
          valueClassName={project.project_number ? "font-mono" : undefined}
          title={
            project.project_number
              ? "The DDEG project number. It isn't unique across projects — check the site address to confirm this is the right job."
              : "The DDEG project number — not assigned yet."
          }
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

  const deliveryLocked = isTerminal || project.status === "converting" || !!pendingDelivery;

  // --- Stage rail: whole workflow at a glance instead of 3 stacked step cards ---
  const reviewDone = pbdbCardState === "approved";
  // Status-driven, not "a PBDR file exists" — a reverted project (#108) can
  // have an old PBDR file on record while its current cycle hasn't
  // reconverted yet, which would otherwise show this step as done.
  const convertingDone = TERMINAL_STATUSES.has(project.status);
  const deliveredDone = project.status === "delivered" || project.status === "complete";
  // Admin owns two setup steps (number + consultant); the consultant only the
  // number — same slot on the rail either way, so the rail stays at 5 stages.
  const setupDone = isAdmin ? !!project.project_number && !!project.assigned : !!project.project_number;
  const stageList: Stage[] = [
    isAdmin
      ? { id: "setup", label: "Number & consultant", state: setupDone ? "done" : "current", icon: "number" }
      : { id: "number", label: "Project number", state: setupDone ? "done" : "current", icon: "number" },
    {
      id: "pbdb",
      label: "PBDB generated",
      state: pbdbFiles.length > 0 ? "done" : setupDone ? "current" : "upcoming",
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
  const dispatchCardBody = (resetWarning?: typeof redispatchResetWarning) => (
    <div className="space-y-4">
      {latestPbdb && (
        <PbdbSendPreview
          projectId={id}
          fileId={latestPbdb.id as string}
          findings={pbdbSendFindings}
          acknowledged={pbdbFlagsAcknowledged}
        />
      )}
      {pbdbReadyToSend && (
        pendingPbdbDelivery ? (
          <PbdbDispatchSchedule
            projectId={id}
            scheduledFor={pendingPbdbDelivery.scheduled_for as string}
            timeZone={businessTimezone}
          />
        ) : (
          <>
            <div>
              <p className="mb-1.5 text-xs font-medium text-zinc-500">Delivery timing</p>
              <ProjectDeliveryDelayPresetSelect
                projectId={id}
                initialValue={project.pbdb_delivery_delay_preset}
                durations={deliveryDurations}
                docType="pbdb"
                projectedSendDate={pbdbSendPreviewIso}
              />
            </div>
            <DispatchButton projectId={id} resetWarning={resetWarning} />
          </>
        )
      )}
      <PbdbReuploadToggle projectId={id} />
    </div>
  );

  const renderPendingReviewCards = () =>
    pendingReviews.map((r) => {
      const emailReplyEvidence = evidenceByReviewId.get(r.id);
      return (
        <PendingReviewCard
          key={r.id}
          closesRound={pendingReviews.length === 1}
          review={r}
          projectId={id}
          stakeholderRoster={stakeholderRoster}
          evidence={
            emailReplyEvidence
              ? {
                  storagePath: emailReplyEvidence.storage_path as string,
                  filename: emailReplyEvidence.original_filename as string,
                }
              : null
          }
          highlighted={justEmailUpdated === r.id}
          waiveRequiresEvidence={!isAdmin}
        />
      );
    });

  let focusCard: React.ReactNode;
  if (isDeleted) {
    focusCard = (
      <FocusCard tone="amber" title="In the recovery bin" subtitle="Permanently deleted after 30 days.">
        <Link href="/admin/recovery" className="text-sm font-medium text-amber-800 underline hover:text-amber-900">
          Go to recovery bin →
        </Link>
      </FocusCard>
    );
  } else if (project.status === "paused") {
    // Must win over every other branch below — pbdbCardState still resolves
    // off the pre-pause status (e.g. "upload"), which would otherwise invite
    // a PBDB upload/dispatch on a project that's supposed to be frozen.
    focusCard = isAdmin ? (
      <FocusCard tone="amber" title="Paused" subtitle={pauseData.pause_reason ?? "Frozen at its current stage."}>
        <ResumeButton projectId={id} daysPaused={daysPaused} />
      </FocusCard>
    ) : (
      <FocusCard tone="neutral" title="Project paused" subtitle="Nothing needed from you right now.">
        <p className="text-sm text-zinc-600">
          This project has been paused. No PBDB or stakeholder actions will go out while it&apos;s on hold — resume it to continue.
        </p>
      </FocusCard>
    );
  } else if (step2Locked) {
    focusCard = isAdmin ? (
      <FocusCard tone="neutral" title="Set the project number" subtitle="Unlocks consultant assignment and PBDB generation.">
        <AdminProjectNumberForm projectId={id} currentNumber={null} />
      </FocusCard>
    ) : (
      <FocusCard tone="neutral" title="Set the project number" subtitle="Unlocks PBDB generation.">
        <ProjectNumberForm projectId={id} projectNumber={project.project_number} bare />
      </FocusCard>
    );
  } else if (isAdmin && !project.assigned) {
    focusCard = (
      <FocusCard tone="neutral" title="Assign a consultant" subtitle="Unlocks PBDB generation for the assignee.">
        <AssignForm projectId={id} consultants={consultants} currentConsultantId="" isReassign={false} />
        {consultants.length === 0 && (
          <p className="mt-3 text-sm text-zinc-500">
            No consultants available.{" "}
            <Link href="/admin/users/invite" className="underline hover:text-zinc-700">
              Create account →
            </Link>
          </p>
        )}
      </FocusCard>
    );
  } else if (unacknowledgedFlags.length > 0) {
    // #114: surfaced at job pickup, gating progress to the next stage of
    // work (PBDB generation) — but never gating acceptance of the job
    // itself, which happens upstream of this page entirely.
    focusCard = (
      <FocusCard
        tone="amber"
        title={`Review ${unacknowledgedFlags.length} flagged field${unacknowledgedFlags.length === 1 ? "" : "s"}`}
        subtitle="Acknowledge each flagged field before continuing to PBDB work."
      >
        <div className="space-y-2">
          {unacknowledgedFlags.map(({ token, label, flag }) => (
            <div
              key={token}
              className="flex items-center justify-between gap-3 rounded-md border border-amber-200 bg-white px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">{label}</p>
                <p className="truncate text-xs text-zinc-500">
                  {flag.candidates.length} candidate{flag.candidates.length === 1 ? "" : "s"}
                  {flag.status === "resolved" ? " · resolved" : " · open"}
                </p>
              </div>
              <FlagAcknowledgeControl
                flagId={flag.id}
                label={label}
                currentValue={extractedFields[token] ?? flag.candidates[0]?.value ?? ""}
                candidates={flag.candidates}
                sourceUrlsByFilename={sourceUrlsByFilename}
                triggerLabel="Review"
              />
            </div>
          ))}
        </div>
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
    focusCard = (
      <FocusCard
        tone="green"
        title="Download the PBDB"
        subtitle={
          isAdmin
            ? `Fresh off generation — ${assignedName ?? "the consultant"} will QA it before uploading the corrected copy.`
            : "Fresh off generation — QA it, then upload the QA'd copy to send to stakeholders."
        }
      >
        <GeneratedPbdbDownload
          projectId={id}
          fileId={latestPbdb.id as string}
          filename={latestPbdb.original_filename as string}
          generatedDate={latestPbdb.created_at as string}
        />
      </FocusCard>
    );
  } else if (pbdbCardState === "upload") {
    focusCard = (
      <FocusCard
        tone="neutral"
        title="Upload QA'd PBDB — this marks QA complete"
        subtitle={
          isAdmin
            ? `${assignedName} hasn't marked it ready yet — you can also upload the QA'd copy on their behalf.`
            : "Uploading the QA'd copy is how you mark QA done. Then you'll pick the delivery timing and dispatch it yourself."
        }
      >
        <PbdbQaUploadForm projectId={id} />
      </FocusCard>
    );
  } else if (pbdbCardState === "ready_to_dispatch") {
    focusCard = (
      <FocusCard tone="green" title="Ready to dispatch" subtitle="QA'd PBDB uploaded — send it out for stakeholder review.">
        {dispatchCardBody()}
      </FocusCard>
    );
  } else if (pbdbCardState === "pending") {
    focusCard = (
      <FocusCard
        tone="amber"
        title="Awaiting stakeholder review"
        subtitle={
          roundSummary.rejected > 0
            ? `${roundSummary.rejected} rejected — ${pendingCount} still to respond. The revision starts once everyone has responded.`
            : `${pendingCount} of ${currentCycleReviews.length} approvals outstanding.`
        }
      >
        <div className="space-y-4">
          {currentCycleComments.length > 0 && roundSummary.rejected > 0 && (
            <div className="divide-y divide-amber-200">
              {currentCycleComments.map((r) => (
                <div key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-semibold text-red-900">{r.stakeholder_name} — rejected</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-800">{r.comments}</p>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">{renderPendingReviewCards()}</div>
          <div className="border-t border-amber-200/60 pt-4">
            <p className="mb-2 text-xs text-zinc-500">
              Nudge everyone (not just non-responders) with a status update before the automatic 1-working-day reminder fires.
            </p>
            <ResendBufferUpdateButton projectId={id} />
          </div>
          <div className="border-t border-amber-200/60 pt-4">
            <p className="mb-2 text-xs text-zinc-500">Need to fix something before everyone responds?</p>
            <PbdbQaUploadForm
              projectId={id}
              submitLabel="Upload new version"
              context="post_dispatch_revision"
              reviewers={currentCycleReviews.map((r) => ({ name: r.stakeholder_name, status: r.status }))}
            >
              <RevisionNoteField
                reviewerNames={currentCycleReviews.map((r) => r.stakeholder_name)}
                required={project.clients?.revision_notes_required ?? false}
              />
            </PbdbQaUploadForm>
          </div>
        </div>
      </FocusCard>
    );
  } else if (pbdbCardState === "revision") {
    focusCard = (
      <FocusCard tone="red" title="Revision requested" subtitle="A stakeholder asked for changes.">
        <div className="space-y-4">
          {currentCycleComments.length > 0 && (
            // Plain text on the tinted card, separated by hairlines: the red card is
            // the one container; boxes inside it would be a card within a card.
            <div className="divide-y divide-red-200">
              {currentCycleComments.map((r) => (
                <div key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-sm font-semibold text-red-900">{r.stakeholder_name}</p>
                  <p className="mt-1 text-sm leading-relaxed text-zinc-800">{r.comments}</p>
                </div>
              ))}
            </div>
          )}
          {workingPbdbNeedsDownload && latestPbdb ? (
            // #195: the round has closed rejected — the #194 download route
            // now serves a copy with the new revision row/cover patched in.
            // Prompt for that download before the upload form, so the
            // consultant doesn't keep correcting a stale pre-patch copy.
            <DownloadRevisedPbdbButton
              projectId={id}
              fileId={latestPbdb.id as string}
              filename={latestPbdb.original_filename as string}
            />
          ) : (
            <PbdbQaUploadForm
              projectId={id}
              submitLabel="Upload revised PBDB"
              context="post_dispatch_revision"
              reviewers={currentCycleReviews.map((r) => ({ name: r.stakeholder_name, status: r.status }))}
            >
              <RevisionNoteField
                reviewerNames={currentCycleReviews.map((r) => r.stakeholder_name)}
                required={project.clients?.revision_notes_required ?? false}
              />
            </PbdbQaUploadForm>
          )}
        </div>
      </FocusCard>
    );
  } else if (pbdbCardState === "ready_to_redispatch") {
    focusCard = (
      <FocusCard tone="green" title="Ready to redispatch" subtitle="Revised PBDB uploaded — resend it to every stakeholder, including anyone who already approved.">
        {dispatchCardBody(redispatchResetWarning)}
      </FocusCard>
    );
  } else if (project.status === "converting") {
    focusCard = (
      <FocusCard tone="green" title="Converting to PBDR" subtitle="All stakeholders approved — this happens automatically.">
        <p className="text-sm text-green-700">No action needed right now.</p>
      </FocusCard>
    );
  } else if (TERMINAL_STATUSES.has(project.status)) {
    focusCard = (
      <FocusCard tone="green" title="Delivery ready" subtitle="Approved and converted — download or hand off below.">
        <div className="space-y-3">
          {pbdrGrouping?.active && (
            <DownloadCard
              href={`/api/download/pbdr/${id}`}
              filename={pbdrGrouping.active.originalFilename}
              originalFilename={pbdrGrouping.active.originalFilename}
              wrapperClassName="flex items-center justify-between rounded-md border border-green-200 bg-white px-4 py-3"
              buttonClassName="shrink-0 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
            >
              <p className="text-sm font-medium text-zinc-900">PBDR</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                Rev {pbdrGrouping.active.revNumber} · {new Date(pbdrGrouping.active.createdAt).toLocaleDateString("en-AU")}
              </p>
            </DownloadCard>
          )}
          <p className="text-xs text-zinc-500">
            Resends a fresh 30-day download link to the submitter
            {project.delivery_recipient_email ? " and the delivery recipient" : ""}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ResendPbdrButton projectId={id} />
            <RevertButton projectId={id} />
          </div>
        </div>
      </FocusCard>
    );
  } else {
    const paymentReady = project.credit_deducted || project.payment_override;
    focusCard = paymentReady ? (
      <FocusCard tone="green" title="Ready to convert" subtitle="All stakeholders approved and payment is clear.">
        <div className="space-y-4">
          <PbdrPreviewButton projectId={id} />
          <div>
            <p className="mb-1.5 text-xs font-medium text-zinc-500">
              Delivery timing — when the PBDR is sent to the client
            </p>
            <ProjectDeliveryDelayPresetSelect
              projectId={id}
              initialValue={project.delivery_delay_preset}
              durations={deliveryDurations}
              projectedSendDate={pbdrSendPreviewIso}
            />
            {project.expected_delivery_date && (
              <p className="mt-1 text-xs text-zinc-500">
                Project due date (contractual):{" "}
                {fmtDMY(new Date(project.expected_delivery_date))}
              </p>
            )}
          </div>
          <ConvertButton projectId={id} />
        </div>
      </FocusCard>
    ) : isAdmin ? (
      <FocusCard tone="green" title="Clear the payment gate" subtitle="All stakeholders approved — convert is blocked until payment is resolved.">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Credit deducted</span>
            <span className="font-medium text-zinc-500">No</span>
          </div>
          <OverrideForm projectId={id} alreadyOverridden={project.payment_override} paymentResolved={project.credit_deducted} />
        </div>
      </FocusCard>
    ) : (
      <FocusCard tone="green" title="Awaiting conversion to PBDR" subtitle="All stakeholders approved — convert is blocked until payment is resolved.">
        <p className="text-sm text-zinc-500">
          Contact an admin to clear the payment gate before this can convert.
        </p>
      </FocusCard>
    );
  }

  // --- Left-rail extras: project number + PBDB stay reachable without a tab switch,
  // once they're no longer the spotlighted focus-card action. Keeps the "Dispatched
  // PBDB" badge and the #qa-pbdb-row scroll target that QaUploadedBanner needs —
  // both only work reliably here since this column is always mounted, unlike tabs.
  const leftRailExtras = (
    <>
      {isAdmin
        ? project.project_number && (
            <AdminProjectNumberForm projectId={id} currentNumber={project.project_number} />
          )
        : !step2Locked && <ProjectNumberCard projectId={id} projectNumber={project.project_number} />}
      {isAdmin && project.assigned && (
        <ConsultantCard
          projectId={id}
          consultants={consultants}
          currentConsultantId={project.assigned.id}
          assignedName={assignedName}
          availability={project.assigned.availability}
          assignmentHistory={assignmentHistory}
        />
      )}
      {pbdbGrouping && (
        <PbdbVersionsCard
          id="pbdb-section"
          projectId={id}
          grouping={pbdbGrouping}
          canRegenerate={canRegeneratePbdb}
        />
      )}
      {isAdmin && !isDeleted && project.status !== "paused" && (
        // #177: delete used to live only behind the settings gear at the very
        // bottom ("took me forever to figure out"). Surfaced here on the page;
        // AdminDeleteButton keeps its confirm dialog and adminDeleteProject
        // keeps the 30-day recovery-bin guardrail.
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-100 bg-red-50/40 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">Delete project</p>
            <p className="truncate text-xs text-zinc-500">Recovery bin for 30 days, then purged.</p>
          </div>
          <AdminDeleteButton projectId={id} />
        </div>
      )}
    </>
  );

  const detailsTab = (
    <>
      {isAdmin && (
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
          <Row label="Client" value={project.clients?.name ?? "No organisation"} wrap />
          <Row
            label="Submitted by"
            wrap
            value={
              submitterName ? (
                <>
                  {submitterName}
                  {project.submitter?.company_role && (
                    <span className="text-zinc-500"> ({project.submitter.company_role})</span>
                  )}
                  {project.submitter?.email && (
                    <span className="ml-2 text-xs text-zinc-500"> · {project.submitter.email}</span>
                  )}
                </>
              ) : (
                "—"
              )
            }
          />
          <Row label="PO number" value={project.po_number ?? "—"} wrap />
          <Row label="Delivery recipient" value={project.delivery_recipient_email ?? "—"} wrap />
          <Row label="Submitted via" value={project.source === "email" ? "Email" : "Portal"} wrap />
        </div>
      )}
      <ProjectDetailsEditor
        projectId={id}
        poNumber={project.po_number}
        fieldEntries={clientFieldEntries}
        orgEntries={orgTokenEntries}
        flagsByToken={flagsByToken}
        sourceUrlsByFilename={sourceUrlsByFilename}
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
            <div className="px-5 py-4 text-sm text-zinc-500">
              No submitter on record — project may have been submitted via email.
            </div>
          )}
        </div>
      </CollapsibleSection>
      <CollapsibleSection title="System values" defaultOpen={false}>
        <div className="divide-y divide-zinc-100">
          {sysValues.map(({ label, value, hint }) => (
            <Row key={label} label={label} value={value} hint={hint} />
          ))}
        </div>
      </CollapsibleSection>
    </>
  );

  const documentsTab = (
    <>
      <CollapsibleSection title="Documents" defaultOpen>
        {submissionFiles.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-500">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {submissionFiles.map((f) => (
              <div key={f.id as string} className="flex items-center gap-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-900">
                    {fileReqLabelMap.get(f.file_type as string) ?? FILE_TYPE_LABELS[f.file_type as string] ?? (f.file_type as string)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{f.original_filename as string}</p>
                  {!f.file_type_confirmed && (
                    <ConfirmFileTypeControl
                      projectId={id}
                      fileId={f.id as string}
                      currentFileType={f.file_type as string}
                    />
                  )}
                  {f.verification_mismatch_reasons && f.verification_confirmed_at && (
                    <VerificationMismatchNote reasons={f.verification_mismatch_reasons as string[]} />
                  )}
                </div>
                <FilePreviewButton projectId={id} fileId={f.id as string} />
                <DownloadCard href={f.signedUrl} wrapperClassName="flex items-center gap-2 p-0" external />
              </div>
            ))}
          </div>
        )}
        {!isDeleted && (
          <div className="border-t border-zinc-100 px-5 py-4">
            <FileUploadForm projectId={id} />
          </div>
        )}
      </CollapsibleSection>
      <CollapsibleSection
        title="Evidence & correspondence"
        subtitle="Forwarded emails, screenshots, or other proof attached to this project"
        defaultOpen={evidenceFiles.length > 0}
      >
        {evidenceFiles.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-500">No evidence attached yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {evidenceFiles.map((f) => (
              <DownloadCard
                key={f.id as string}
                href={f.signedUrl}
                originalFilename={f.original_filename as string}
                external
                preview={<FilePreviewButton projectId={id} fileId={f.id as string} />}
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
        {!isDeleted && (
          <div className="border-t border-zinc-100 px-5 py-4">
            <AttachEvidenceForm projectId={id} />
          </div>
        )}
      </CollapsibleSection>
      {/* PBDB versions + regenerate live in the left rail (leftRailExtras above) —
          always visible there, not tucked behind this tab, for every role. */}
      {pbdrGrouping && (
        <CollapsibleSection title="PBDR" subtitle="Final converted document delivered to the client." defaultOpen>
          <div className="p-3">
            <VersionTiers
              projectId={id}
              active={pbdrGrouping.active}
              historical={pbdrGrouping.historical}
              // The PBDR download route only serves the latest file, so older
              // revisions are listed (and previewable) but not downloadable.
              hrefFor={(_fileId, tier) => (tier === "active" ? `/api/download/pbdr/${id}` : null)}
            />
          </div>
        </CollapsibleSection>
      )}
    </>
  );

  const reviewsSection =
    allReviews.length === 0 ? (
      <p className="px-1 py-4 text-sm text-zinc-500">No stakeholder reviews yet.</p>
    ) : (
      <CollapsibleSection
        title="Stakeholder reviews"
        subtitle="One block per revision sent to stakeholders. Rev 0 is the first review; each later Rev follows a rejection."
        defaultOpen
      >
        {reviewCycles.map((cycle) => {
          const cycleReviews = reviewsByCycle.get(cycle)!;
          const pbdbForCycle = pbdbFiles.find((f) => (f.review_cycle as number) === cycle);
          const isCurrent = cycle === project.review_cycle;
          return (
            <div key={cycle} className="border-b border-zinc-100 last:border-b-0">
              <div className="flex flex-wrap items-center gap-2 bg-zinc-50 px-5 py-2.5">
                <span className="text-xs font-semibold text-zinc-700">Rev {cycle - 1}</span>
                {pbdbForCycle ? (
                  <span className="text-xs text-zinc-500">
                    · PBDB sent {new Date(pbdbForCycle.created_at as string).toLocaleDateString("en-AU")}
                  </span>
                ) : (
                  <span className="text-xs text-zinc-500">· No PBDB for this Rev</span>
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
                    // Internal only (#191): still pending when a revised PBDB force-closed the round.
                    superseded: { label: "Superseded", cls: "bg-zinc-100 text-zinc-500" },
                  }[r.status] ?? { label: r.status, cls: "bg-zinc-100 text-zinc-500" };
                  const emailReplyEvidence = evidenceByReviewId.get(r.id);
                  return (
                    <div key={r.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-900">{r.stakeholder_name}</p>
                          <p className="font-mono text-xs text-zinc-500">{r.stakeholder_email}</p>
                          {r.comments && (
                            <p className="mt-1.5 text-sm leading-relaxed text-zinc-700">{r.comments}</p>
                          )}
                          {isAdmin && r.waive_reason && (
                            <p className="mt-1 text-xs text-zinc-500">Waive reason: {r.waive_reason}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-start gap-2">
                          <div className="text-right">
                            <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.cls}`}>
                              {statusConfig.label}
                            </span>
                            {r.responded_at && (
                              <p className="mt-0.5 text-xs text-zinc-500">
                                {new Date(r.responded_at).toLocaleDateString("en-AU", {
                                  day: "numeric", month: "short", year: "numeric",
                                })}
                              </p>
                            )}
                          </div>
                          {isCurrent && (
                            <ReviewResponseControl
                              review={r}
                              projectId={id}
                              roundStatus={currentRoundStatus}
                              revisionNumber={currentRevNumber}
                              pendingCount={pendingCount}
                              roster={stakeholderRoster}
                              evidence={
                                emailReplyEvidence
                                  ? {
                                      storagePath: emailReplyEvidence.storage_path as string,
                                      filename: emailReplyEvidence.original_filename as string,
                                    }
                                  : undefined
                              }
                              loggedByEmail={loggedByByReviewId.get(r.id)}
                            />
                          )}
                        </div>
                      </div>
                      {r.email_reply_text && (
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-semibold text-amber-800">Replied by email — needs action</p>
                            {r.email_reply_sender_verified === false && (
                              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700">
                                Unverified sender
                              </span>
                            )}
                            {r.email_reply_received_at && (
                              <span className="text-xs text-amber-600">
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

  const stakeholdersTab = (
    <>
      {isAdmin && (
        <CollapsibleSection
          title="Reviewers"
          subtitle="Required reviewers come from the template and can't be removed here. Add extra one-off reviewers from the client's roster or a one-off contact."
          defaultOpen
        >
          <ProjectStakeholderSection
            projectId={id}
            templateRequired={templateRequiredStakeholders}
            extras={projectStakeholders}
            orgRoster={orgRoster}
            locked={project.status === "converting" || TERMINAL_STATUSES.has(project.status)}
          />
        </CollapsibleSection>
      )}
      {reviewsSection}
    </>
  );

  const sharedSettings = (
    <>
      <div>
        <h3 className="text-sm font-semibold text-zinc-900">PBDB delivery timing</h3>
        <p className="mt-1 mb-3 text-xs leading-relaxed text-zinc-500">
          Sets how long to wait after QA is complete before the PBDB dispatches to stakeholders
          for review — independent of the PBDR delivery timing below.
        </p>
        <ProjectDeliveryDelayPresetSelect
          projectId={id}
          initialValue={project.pbdb_delivery_delay_preset}
          durations={deliveryDurations}
          docType="pbdb"
          projectedSendDate={pbdbSendPreviewIso}
        />
      </div>
      <div className="border-t border-zinc-100 pt-3">
        <h3 className="text-sm font-semibold text-zinc-900">Delivery timing</h3>
        <p className="mt-1 mb-3 text-xs leading-relaxed text-zinc-500">
          Sets how long to wait after every stakeholder approves before the final report (PBDR)
          goes out to the client.
        </p>
        <ProjectDeliveryDelayPresetSelect
          projectId={id}
          initialValue={project.delivery_delay_preset}
          durations={deliveryDurations}
          docType="pbdr"
          projectedSendDate={pbdrSendPreviewIso}
        />
        {project.expected_delivery_date && (
          <p className="mt-1 text-xs text-zinc-500">
            Project due date (contractual): {fmtDMY(new Date(project.expected_delivery_date))} — the
            send date above is separate.
          </p>
        )}
        {deliveryLocked ? (
          <p className="mt-2.5 rounded-md bg-zinc-50 px-2.5 py-2 text-xs leading-relaxed text-zinc-500">
            All stakeholders already approved, so this delivery is using whatever was set
            beforehand — changing it now won&apos;t affect this PBDR.
          </p>
        ) : (
          <p className="mt-2.5 rounded-md bg-amber-50 px-2.5 py-2 text-xs leading-relaxed text-amber-700">
            Set this before the last stakeholder approves — it locks in at that point and can&apos;t
            be changed retroactively.
          </p>
        )}
      </div>
      {pendingDelivery && (
        <div className="border-t border-zinc-100 pt-3">
          <PendingDeliveryPanel projectId={id} scheduledFor={pendingDelivery.scheduled_for as string} timeZone={businessTimezone} />
        </div>
      )}
      {latestPbdb && (
        <div className="border-t border-zinc-100 pt-3">
          <p className="text-xs font-medium text-zinc-600">Client document colour</p>
          <p className="mt-1 mb-2 text-xs text-zinc-500">
            Black text, or the original red token colour, when the client downloads the PBDB.
          </p>
          <ProjectStripColorToggle projectId={id} initialValue={project.strip_token_color} />
        </div>
      )}
    </>
  );

  const settingsContent = isDeleted ? (
    <p className="text-sm text-zinc-500">Project is in the recovery bin — controls are unavailable.</p>
  ) : (
    <>
      {isAdmin && (
        <div className="border-b border-zinc-100 pb-4">
          {project.status === "paused" ? (
            <p className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-500">
              Payment override disabled while project is paused.
            </p>
          ) : (
            <>
              <h3 className="mb-1 text-sm font-semibold text-zinc-900">Payment gate</h3>
              <div className="mb-2 flex gap-4 text-xs">
                <span>
                  <span className="text-zinc-500">Credit deducted: </span>
                  <span className={project.credit_deducted ? "font-medium text-green-700" : "text-zinc-500"}>
                    {project.credit_deducted ? "Yes" : "No"}
                  </span>
                </span>
                {project.payment_override && (
                  <span>
                    <span className="text-zinc-500">Override applied: </span>
                    <span className="font-medium text-amber-700">
                      {project.payment_override_at
                        ? new Date(project.payment_override_at).toLocaleDateString("en-AU")
                        : "Yes"}
                    </span>
                  </span>
                )}
              </div>
              {project.payment_override && project.payment_override_reason && (
                <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <span className="font-medium">Override reason: </span>
                  {project.payment_override_reason}
                </div>
              )}
              <OverrideForm projectId={id} alreadyOverridden={project.payment_override} paymentResolved={project.credit_deducted} />
            </>
          )}
        </div>
      )}
      {sharedSettings}
      {isAdmin &&
        (project.status === "paused" ? (
          <div className="border-t border-zinc-100 pt-4">
            <h3 className="mb-1 text-sm font-semibold text-zinc-900">Project controls</h3>
            <p className="text-xs text-zinc-500">Paused — resume from the panel on the left.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-red-100 bg-red-50/40 p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">Danger zone</p>
            <div className="space-y-2">
              {!TERMINAL_STATUSES.has(project.status) && (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-900">Pause project</p>
                    <p className="truncate text-xs text-zinc-500">Delivery date shifts by the days paused, on resume.</p>
                  </div>
                  <PauseForm projectId={id} />
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">Delete project</p>
                  <p className="truncate text-xs text-zinc-500">Recovery bin for 30 days, then purged.</p>
                </div>
                <AdminDeleteButton projectId={id} />
              </div>
            </div>
          </div>
        ))}
    </>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <RealtimeSubscriptionRefresher
        channelName={isAdmin ? `admin-project-${id}` : `ops-project-${id}`}
        subscriptions={[
          { table: "projects", filter: `id=eq.${id}` },
          { table: "project_files", filter: `project_id=eq.${id}` },
          { table: "field_flags", filter: `project_id=eq.${id}` },
          { table: "stakeholder_reviews", filter: `project_id=eq.${id}` },
        ]}
      />
      {!isAdmin && revisionTableWarning && (
        <RevisionTablePatchWarningBanner
          warning={revisionTableWarning}
          cleanUrl={`${basePath}${justUploadedQa ? "?qa_uploaded=1" : ""}`}
        />
      )}
      {!isAdmin && justPickedUp && (
        <PickedUpBanner projectId={id} isTerminal={isTerminal} hasProjectNumber={!!project.project_number} />
      )}
      {!isAdmin && justUploadedQa && <QaUploadedBanner cleanUrl={basePath} />}
      {isAdmin && justSavedNumber && <NumberSavedBanner cleanUrl={basePath} />}
      {isAdmin && justGeneratedPbdb && <PbdbGeneratedBanner cleanUrl={basePath} />}
      {isAdmin && justAssigned && (
        <AdminSuccessBanner
          cleanUrl={basePath}
          title="Consultant assigned"
          body="The consultant has been notified and the project is now in progress."
        />
      )}
      {isAdmin && justPaused && (
        <AdminSuccessBanner
          cleanUrl={basePath}
          title="Project paused"
          body="The project has been frozen. Resume it at any time from Settings."
        />
      )}
      {isAdmin && justResumed && (
        <AdminSuccessBanner
          cleanUrl={basePath}
          title="Project resumed"
          body="The delivery date has been extended to account for the time paused."
        />
      )}
      {isAdmin && justPaymentOverridden && (
        <AdminSuccessBanner
          cleanUrl={basePath}
          title="Payment override applied"
          body="The project has been flagged as Override — Payment Pending."
        />
      )}
      {isAdmin && justPaymentReconciled && (
        <AdminSuccessBanner
          cleanUrl={basePath}
          title="Override reconciled"
          body="Payment has been marked as collected and the override flag has been cleared."
        />
      )}
      {justQueueApproved && (
        <AdminSuccessBanner
          cleanUrl={basePath}
          title="Submission approved"
          body="Please confirm the document types flagged below before continuing."
        />
      )}
      {justPbdrResent && (
        <AdminSuccessBanner
          cleanUrl={basePath}
          title="Delivery email resent"
          body="A fresh 30-day download link has been sent to the submitter."
        />
      )}
      {justReviewWaived && (
        <AdminSuccessBanner
          cleanUrl={basePath}
          title="Review waived"
          body="The stakeholder's review has been waived and the audit trail updated."
        />
      )}
      {justEmailUpdated && (
        <AdminSuccessBanner
          cleanUrl={basePath}
          title="Email updated"
          body="The stakeholder's email has been updated and a fresh approval link has been resent."
        />
      )}
      <Link
        href={isAdmin ? (isDeleted ? "/admin/recovery" : "/admin/projects") : "/ops"}
        className="text-sm text-zinc-500 hover:text-zinc-700"
      >
        {isAdmin ? (isDeleted ? "← Recovery bin" : "← Projects") : "← My projects"}
      </Link>

      {isAdmin && isDeleted && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">This project is in the recovery bin.</span>{" "}
          It will be permanently deleted after 30 days.{" "}
          <Link href="/admin/recovery" className="font-medium underline hover:text-amber-900">
            Go to recovery bin →
          </Link>
        </div>
      )}
      {isAdmin && project.status === "paused" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Project paused.</span>
          {pauseData.pause_reason && (
            <>{" "}<span className="text-amber-700">{pauseData.pause_reason}</span></>
          )}
        </div>
      )}
      {isAdmin && isOverdue && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="font-semibold">
            Overdue by {daysOverdue} day{daysOverdue !== 1 ? "s" : ""}.
          </span>{" "}
          {project.status === "submitted"
            ? "No consultant has been assigned — assign one from the panel on the left."
            : project.status === "dispatched" && pendingReviews.length > 0
            ? `${pendingReviews.length} stakeholder${pendingReviews.length !== 1 ? "s" : ""} yet to respond — see the panel on the left.`
            : project.status === "revision_required"
            ? "A revision has been requested — the consultant must upload a corrected document."
            : `Expected delivery date has passed.`}
        </div>
      )}

      <AltWorkspace
        header={headerCard}
        stages={stageList}
        focusCard={focusCard}
        leftRailExtras={leftRailExtras}
        detailsTab={detailsTab}
        documentsTab={documentsTab}
        stakeholdersTab={stakeholdersTab}
        settingsContent={settingsContent}
        settingsTitle={isAdmin ? "Project Config" : undefined}
        auditTab={auditTab}
        defaultRefTab={justQueueApproved ? "documents" : undefined}
      />
    </div>
  );
}

function Row({
  label,
  value,
  hint,
  wrap,
}: {
  label: string;
  value: React.ReactNode;
  /** Hover hint (#176) — the explanation sits in a tooltip on the row rather
   *  than trailing the value inline. */
  hint?: string;
  /** Let long values wrap instead of truncating (admin identifying rows). */
  wrap?: boolean;
}) {
  return (
    <div className={`flex items-baseline gap-4 px-5 py-3 ${hint ? "cursor-help" : ""}`} title={hint}>
      <span className="w-36 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className={`min-w-0 flex-1 text-sm text-zinc-900 ${wrap ? "" : "truncate"}`}>{value}</span>
    </div>
  );
}
