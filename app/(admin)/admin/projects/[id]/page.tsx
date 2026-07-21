import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssignForm, type ConsultantOption } from "./_components/AssignForm";
import { OverrideForm } from "./_components/OverrideForm";
import { FileUploadForm } from "./_components/FileUploadForm";
import { WaiveForm } from "./_components/WaiveForm";
import { ResendTokenButton } from "./_components/ResendTokenButton";
import { UpdateEmailReveal } from "./_components/UpdateEmailReveal";
import { ProjectStakeholderSection } from "./_components/ProjectStakeholderSection";
import { ConvertButton } from "./_components/ConvertButton";
import { DispatchButton } from "./_components/DispatchButton";
import { ResendPbdrButton } from "./_components/ResendPbdrButton";
import { PauseForm } from "./_components/PauseForm";
import { ResumeButton } from "./_components/ResumeButton";
import { AdminDeleteButton } from "./_components/AdminDeleteButton";
import { AdminProjectNumberForm } from "./_components/AdminProjectNumberForm";
import { ConsultantCard } from "./_components/ConsultantCard";
import { prettifyToken } from "@/lib/tokens/prettify";
import { ProjectStripColorToggle } from "@/components/ProjectStripColorToggle";
import { ProjectDeliveryDelayPresetSelect } from "@/components/ProjectDeliveryDelayPresetSelect";
import { PendingDeliveryPanel } from "@/components/PendingDeliveryPanel";
import type { DeliveryDelayPreset } from "@/lib/delivery/delivery-delay";
import { getDeliveryDelayDurations } from "@/lib/settings/delivery-delay";
import { DownloadCard } from "@/components/DownloadCard";
import { AttachEvidenceForm } from "@/components/AttachEvidenceForm";
import { GeneratePbdbButton } from "@/components/PbdbGenerationButtons";
import { NumberSavedBanner } from "@/components/NumberSavedBanner";
import { PbdbGeneratedBanner } from "@/components/PbdbGeneratedBanner";
import { AdminSuccessBanner } from "@/components/AdminSuccessBanner";
import { HighlightRing } from "@/components/HighlightRing";
import { PbdbQaUploadForm } from "@/app/(consultant)/ops/projects/[id]/_components/PbdbQaUploadForm";
import { RevisionNoteField } from "@/app/(consultant)/ops/projects/[id]/_components/RevisionNoteField";
import { ProjectDetailsEditor, type OpenFieldFlag } from "@/app/(consultant)/ops/projects/[id]/_components/ProjectDetailsEditor";
import { ReExtractButton } from "@/components/ReExtractButton";
import { ProjectAuditTrail, type ProjectAuditRow } from "@/app/(consultant)/ops/projects/[id]/_components/ProjectAuditTrail";
import { PbdbVersionsCard } from "@/app/(consultant)/ops/projects/[id]/_components/PbdbVersionsCard";
import { CollapsibleSection } from "@/app/(consultant)/ops/projects/[id]/_components/CollapsibleSection";
import { LogStakeholderResponseForm } from "@/app/(consultant)/ops/projects/[id]/_components/LogStakeholderResponseForm";
import { AltWorkspace } from "@/app/(consultant)/ops/projects/[id]/_components/AltWorkspace";
import { HeaderStatInline } from "@/app/(consultant)/ops/projects/[id]/_components/HeaderStatInline";
import { FocusCard } from "@/components/workspace/FocusCard";
import type { Stage } from "@/components/workspace/StageRail";
import { PROJECT_AUDIT_EXCLUDED_EVENTS } from "@/lib/audit/project-scope";
import type { ProjectStatus, ConsultantAvailability, StakeholderReview } from "@/types";

// Adopts the same StageRail + FocusCard + pill-tab + SettingsPill shell
// already used by the client (ClientWorkspace) and consultant (AltWorkspace)
// pages — see the prototype at app/prototype-admin-projectdetail/page.tsx
// (Variant E — "always-visible edit cards" — chosen after review) for the
// design rationale. Replaces the previous 5-tab (Overview / Admin Workflow /
// Consultant Workflow / Controls / Audit) StepCard layout, which duplicated
// the entire consultant workflow verbatim just so admins could see it.
//
// Notable behaviour change from the old layout: the old "Admin Workflow"
// tab let PBDB generation unlock as soon as the project number was set,
// independent of consultant assignment (the two were only related via
// separate StepCard locks). The unified FocusCard now asks for a consultant
// before offering PBDB generation — a deliberate tightening (you shouldn't
// generate the work product before someone owns it), not a capability
// removal; assignment remains one click away either way.
//
// The PBDB versions/regenerate card in the left rail is now hidden entirely
// once regeneration is no longer available (post-dispatch), rather than
// showing a disabled button — the version history itself stays reachable
// via the Documents tab regardless.

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

const LIVE_STATUSES: readonly ProjectStatus[] = [
  "submitted", "assigned", "in_progress", "dispatched", "revision_required",
];

const UPLOAD_NEW_VERSION_COPY =
  "Uploading a new version will reset all stakeholder approvals and resend the approval email with the updated document.";

function overdueInfo(
  deliveryDate: string | null,
  status: ProjectStatus,
  isDeleted: boolean,
): { isOverdue: boolean; daysOverdue: number } {
  if (isDeleted || !deliveryDate || !LIVE_STATUSES.includes(status))
    return { isOverdue: false, daysOverdue: 0 };
  const ms = Date.now() - new Date(deliveryDate).getTime();
  if (ms <= 0) return { isOverdue: false, daysOverdue: 0 };
  return { isOverdue: true, daysOverdue: Math.ceil(ms / (1000 * 60 * 60 * 24)) };
}

function calcDaysPaused(pausedAt: string | null): number {
  if (!pausedAt) return 0;
  return Math.ceil((Date.now() - new Date(pausedAt).getTime()) / (1000 * 60 * 60 * 24));
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 px-5 py-3">
      <span className="w-36 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className="min-w-0 flex-1 text-sm text-zinc-900">{value}</span>
    </div>
  );
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const justSavedNumber = sp.number_saved === "1";
  const justAssigned = sp.assigned === "1";
  const justDispatched = sp.dispatched === "1";
  const justPaused = sp.paused === "1";
  const justResumed = sp.resumed === "1";
  const justPbdrResent = sp.pbdr_resent === "1";
  const justPaymentOverridden = sp.payment_overridden === "1";
  const justPaymentReconciled = sp.payment_reconciled === "1";
  const justReviewWaived = sp.review_waived === "1";
  const justGeneratedPbdb = sp.pbdb_generated === "1";
  const justEmailUpdated = sp.email_updated ?? null;

  const supabase = createAdminClient();

  const [projectResult, consultantsResult, pendingDeliveryResult] = await Promise.all([
    supabase
      .from("projects")
      .select(`
        id,
        project_number,
        po_number,
        status,
        extracted_fields,
        template_id,
        delivery_recipient_email,
        expected_delivery_date,
        credit_deducted,
        payment_override,
        payment_override_reason,
        payment_override_at,
        deleted_at,
        created_at,
        updated_at,
        source,
        review_cycle,
        strip_token_color,
        delivery_delay_preset,
        qa_completed_by,
        clients(id, name, client_config, revision_notes_required),
        assigned:users!projects_assigned_consultant_id_fkey(id, first_name, last_name, email, availability)
      `)
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("users")
      .select("id, first_name, last_name, email, availability")
      .eq("role", "consultant")
      .eq("is_locked", false)
      .order("first_name"),
    supabase.from("pending_deliveries").select("scheduled_for").eq("project_id", id).maybeSingle(),
  ]);

  if (projectResult.error) console.error(`[admin/projects/${id}] project query failed:`, projectResult.error);
  if (!projectResult.data) notFound();

  const pendingDelivery = pendingDeliveryResult.data as { scheduled_for: string } | null;
  const deliveryDurations = await getDeliveryDelayDurations(supabase);

  type ProjectDetail = {
    id: string;
    project_number: string | null;
    po_number: string | null;
    status: ProjectStatus;
    extracted_fields: Record<string, string> | null;
    template_id: string | null;
    delivery_recipient_email: string | null;
    expected_delivery_date: string | null;
    credit_deducted: boolean;
    payment_override: boolean;
    payment_override_reason: string | null;
    payment_override_at: string | null;
    deleted_at: string | null;
    created_at: string;
    updated_at: string;
    source: "portal" | "email";
    strip_token_color: boolean;
    delivery_delay_preset: DeliveryDelayPreset;
    clients: {
      id: string;
      name: string;
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
    review_cycle: number;
    qa_completed_by: string | null;
  };

  const project = projectResult.data as unknown as ProjectDetail;
  const isDeleted = !!project.deleted_at;
  const consultants = (consultantsResult.data ?? []) as ConsultantOption[];

  type PauseData = { paused_at: string | null; paused_previous_status: string | null; pause_reason: string | null };
  let pauseData: PauseData = { paused_at: null, paused_previous_status: null, pause_reason: null };
  if (project.status === "paused") {
    const { data: pd } = await supabase
      .from("projects")
      .select("paused_at, paused_previous_status, pause_reason")
      .eq("id", id)
      .maybeSingle();
    if (pd) pauseData = pd as unknown as PauseData;
  }
  const currentConsultantId = project.assigned?.id ?? "";

  const [
    { data: mappings },
    { data: rawSubmissionFiles },
    { data: rawEvidenceFiles },
    { data: rawPbdbFiles },
    { data: rawPbdrFiles },
    { data: rawReviews },
    { data: rawProjectStakeholders },
    { data: rawAssignments },
    { data: rawFullAuditEntries },
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
      .select("id, file_type, original_filename, storage_path, created_at")
      .eq("project_id", id)
      .in("file_type", ["po", "purchase_order", "building_plans", "building_drawing_plans", "additional"])
      .order("created_at"),
    supabase
      .from("project_files")
      .select("id, original_filename, storage_path, reference, created_at")
      .eq("project_id", id)
      .eq("file_type", "evidence")
      .order("created_at", { ascending: false }),
    supabase
      .from("project_files")
      .select("id, original_filename, storage_path, version, created_at")
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
      .select("id, review_cycle, stakeholder_email, stakeholder_name, status, comments, responded_at, waive_reason, waived_at")
      .eq("project_id", id)
      .order("review_cycle", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("stakeholders")
      .select("id, name, email, company")
      .eq("scope", "project")
      .eq("scope_id", id)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true }),
    supabase
      .from("audit_log")
      .select("metadata, created_at")
      .eq("project_id", id)
      .eq("event_type", "assignment.created")
      .order("created_at", { ascending: true }),
    supabase
      .from("audit_log")
      .select("id, event_type, actor_email, metadata, created_at")
      .eq("project_id", id)
      .not("event_type", "in", `(${PROJECT_AUDIT_EXCLUDED_EVENTS.join(",")})`)
      .order("created_at", { ascending: true }),
    supabase
      .from("field_flags")
      .select("id, field_key, candidate_values")
      .eq("project_id", id)
      .eq("status", "open"),
  ]);

  const auditEntries = (rawFullAuditEntries ?? []) as ProjectAuditRow[];

  const flagsByToken: Record<string, OpenFieldFlag> = Object.fromEntries(
    (openFieldFlags ?? []).map((f) => [
      f.field_key as string,
      { id: f.id as string, candidates: (f.candidate_values ?? []) as OpenFieldFlag["candidates"] },
    ])
  );

  const [files, evidenceFiles, pbdrFiles] = await Promise.all([
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

  const reviews = (rawReviews ?? []) as StakeholderReview[];

  type AssignmentEvent = { consultant_id: string; consultant_name: string; project_status?: string };
  const assignmentHistory = (rawAssignments ?? [])
    .map((row) => {
      const meta = row.metadata as AssignmentEvent | null;
      return meta?.consultant_id
        ? {
            consultantId: meta.consultant_id,
            consultantName: meta.consultant_name,
            assignedAt: row.created_at as string,
            projectStatusAtAssignment: meta.project_status ?? null,
          }
        : null;
    })
    .filter((a): a is NonNullable<typeof a> => a !== null);

  const isTerminal = project.status === "delivered" || project.status === "complete";

  const projectStakeholders = (rawProjectStakeholders ?? []) as {
    id: string; name: string; email: string; company: string | null;
  }[];

  const currentCycleReviews = reviews.filter(
    (r) => r.review_cycle === project.review_cycle
  );
  const allCurrentAcknowledged =
    currentCycleReviews.length > 0 &&
    currentCycleReviews.every((r) => r.status !== "pending");

  const pendingReviews = currentCycleReviews.filter((r) => r.status === "pending");

  const reviewsByCycle = new Map<number, StakeholderReview[]>();
  for (const r of reviews) {
    if (!reviewsByCycle.has(r.review_cycle)) reviewsByCycle.set(r.review_cycle, []);
    reviewsByCycle.get(r.review_cycle)!.push(r);
  }
  const reviewCycles = [...reviewsByCycle.keys()].sort((a, b) => b - a);

  const { isOverdue, daysOverdue } = overdueInfo(project.expected_delivery_date, project.status, isDeleted);
  const daysPaused = calcDaysPaused(pauseData.paused_at);

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

  const assignedName = project.assigned
    ? [project.assigned.first_name, project.assigned.last_name].filter(Boolean).join(" ") || project.assigned.email
    : null;

  const canRegeneratePbdb = (["assigned", "in_progress"] as ProjectStatus[]).includes(project.status);
  const deliveryLocked = isTerminal || project.status === "converting" || !!pendingDelivery;

  // ── Page title ──────────────────────────────────────────────────────────────
  const pageTitle = (() => {
    const addr = extractedFields["EXTRACT_ADDRESS"] as string | undefined;
    if (project.project_number && addr) return `${project.project_number} — ${addr}`;
    if (addr) return addr;
    return project.po_number ? `PO ${project.po_number}` : project.id.slice(0, 8);
  })();

  // ── Header card — matches the consultant page's altHeaderCard exactly ───────
  const headerCard = (
    <div className={`rounded-xl border border-zinc-200 border-l-[3px] ${STATUS_ACCENT[project.status]} bg-white p-5`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <h1 className="text-base font-semibold text-zinc-900">{pageTitle}</h1>
        <span className="text-sm text-zinc-400">{project.clients?.name ?? "No organisation"}</span>
        <span className={`self-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[project.status]}`}>
          {STATUS_LABELS[project.status]}
        </span>
        <span className={`self-center inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          project.source === "email" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
        }`}>
          {project.source === "email" ? "Email" : "Portal"}
        </span>
        {project.payment_override && (
          <span className="self-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Override — Payment Pending
          </span>
        )}
        {isOverdue && (
          <span className="self-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Overdue
          </span>
        )}
        {isDeleted && (
          <span className="self-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
            Deleted
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-7 gap-y-1.5 border-t border-zinc-100 pt-3 text-sm">
        <span className="inline-flex items-center gap-1 text-zinc-500" title={`Review cycle ${project.review_cycle}`}>
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 002.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0112.888 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
          </svg>
          <span className="font-medium text-zinc-900">{project.review_cycle}</span>
        </span>
        <HeaderStatInline
          label="Assigned"
          value={assignedName ?? "Unassigned"}
          valueClassName={assignedName ? undefined : "text-amber-700"}
          noLeftBorder
        />
        <HeaderStatInline label="Submitted" value={new Date(project.created_at).toLocaleDateString("en-AU")} />
        <HeaderStatInline
          label="Due"
          value={project.expected_delivery_date ? new Date(project.expected_delivery_date).toLocaleDateString("en-AU") : "—"}
          valueClassName={isOverdue ? "text-red-600" : undefined}
        />
        <HeaderStatInline value={project.project_number ? `#${project.project_number}-S` : "Project number not yet set"} />
      </div>
    </div>
  );

  // ── Stage rail — 5 stages (matches the client/consultant StageRail budget;
  // an earlier pass gave admin 6 and it overflowed the 22rem left rail) ───────
  const setupDone = !!project.project_number && !!project.assigned;
  const pbdbDone = pbdbFiles.length > 0;
  const reviewDone = allCurrentAcknowledged || project.status === "converting" || isTerminal;
  const delivered = project.status === "delivered" || project.status === "complete";

  const stageList: Stage[] = [
    { id: "setup", label: "Number & consultant", icon: "number", state: setupDone ? "done" : "current" },
    { id: "pbdb", label: "PBDB generated", icon: "document", state: pbdbDone ? "done" : setupDone ? "current" : "upcoming" },
    {
      id: "review", label: "Stakeholder review", icon: "people",
      state: reviewDone ? "done" : pbdbDone ? "current" : "upcoming",
      urgency: project.status === "revision_required" ? "red" : project.status === "dispatched" ? "amber" : "neutral",
    },
    {
      id: "convert", label: "Converting to PBDR", icon: "refresh",
      state: delivered ? "done" : (project.status === "converting" || reviewDone) ? "current" : "upcoming",
      urgency: "green",
    },
    { id: "delivered", label: "Delivered", icon: "flag", state: delivered ? "done" : "upcoming" },
  ];

  // ── Focus card — whichever single thing is actionable right now. Unifies
  // the old "Admin Workflow" and "Consultant Workflow" tabs (which mirrored
  // each other almost exactly) into one spotlighted action. ────────────────
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
    focusCard = (
      <FocusCard tone="amber" title="Paused" subtitle={pauseData.pause_reason ?? "Frozen at its current stage."}>
        <ResumeButton projectId={id} daysPaused={daysPaused} />
      </FocusCard>
    );
  } else if (!project.project_number) {
    focusCard = (
      <FocusCard tone="neutral" title="Set the project number" subtitle="Unlocks consultant assignment and PBDB generation.">
        <AdminProjectNumberForm projectId={id} currentNumber={null} />
      </FocusCard>
    );
  } else if (!project.assigned) {
    focusCard = (
      <FocusCard tone="neutral" title="Assign a consultant" subtitle="Unlocks PBDB generation for the assignee.">
        <AssignForm projectId={id} consultants={consultants} currentConsultantId="" isReassign={false} />
        {consultants.length === 0 && (
          <p className="mt-3 text-sm text-zinc-400">
            No consultants available.{" "}
            <Link href="/admin/users/invite" className="underline hover:text-zinc-700">
              Create account →
            </Link>
          </p>
        )}
      </FocusCard>
    );
  } else if (pbdbFiles.length === 0) {
    focusCard = (
      <FocusCard id="pbdb-section" tone="neutral" title="Generate the PBDB" subtitle="Ready when you are.">
        <GeneratePbdbButton projectId={id} />
      </FocusCard>
    );
  } else if (project.status === "assigned" || (project.status === "in_progress" && !project.qa_completed_by)) {
    focusCard = (
      <FocusCard
        tone="neutral"
        title="Awaiting QA'd PBDB"
        subtitle={`${assignedName} hasn't marked it ready yet — you can also upload on their behalf.`}
      >
        <PbdbQaUploadForm projectId={id} />
      </FocusCard>
    );
  } else if (project.status === "in_progress" && !!project.qa_completed_by) {
    focusCard = (
      <FocusCard tone="neutral" title="Dispatch to stakeholders" subtitle="QA complete — send it out for approval.">
        <DispatchButton projectId={id} />
      </FocusCard>
    );
  } else if (project.status === "dispatched" && pendingReviews.length > 0) {
    focusCard = (
      <FocusCard
        tone="amber"
        title="Awaiting stakeholder review"
        subtitle={`${pendingReviews.length} of ${currentCycleReviews.length} approvals outstanding.`}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            {pendingReviews.map((r) => {
              const inner = (
                <div className="space-y-2 rounded-md border border-amber-200 bg-white px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900">{r.stakeholder_name}</p>
                    <p className="truncate text-xs text-zinc-500">{r.stakeholder_email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <ResendTokenButton reviewId={r.id} projectId={id} />
                    <LogStakeholderResponseForm
                      reviewId={r.id}
                      projectId={id}
                      stakeholderName={r.stakeholder_name}
                      stakeholderEmail={r.stakeholder_email}
                    />
                    <UpdateEmailReveal reviewId={r.id} projectId={id} currentEmail={r.stakeholder_email} />
                    <WaiveForm reviewId={r.id} projectId={id} stakeholderName={r.stakeholder_name} />
                  </div>
                </div>
              );
              return <div key={r.id}>{justEmailUpdated === r.id ? <HighlightRing>{inner}</HighlightRing> : inner}</div>;
            })}
          </div>
          <div className="border-t border-amber-200/60 pt-4">
            <p className="mb-2 text-xs text-zinc-500">Need to fix something before everyone responds?</p>
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
          </div>
        </div>
      </FocusCard>
    );
  } else if (project.status === "revision_required") {
    const currentCycleComments = currentCycleReviews.filter((r) => r.comments);
    focusCard = (
      <FocusCard tone="red" title="Revision requested" subtitle="A stakeholder asked for changes — the consultant must upload a corrected PBDB.">
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
  } else if (project.status === "dispatched" && allCurrentAcknowledged) {
    const paymentReady = project.credit_deducted || project.payment_override;
    focusCard = paymentReady ? (
      <FocusCard tone="green" title="Ready to convert" subtitle="All stakeholders approved and payment is clear.">
        <ConvertButton projectId={id} />
      </FocusCard>
    ) : (
      <FocusCard tone="green" title="Clear the payment gate" subtitle="All stakeholders approved — convert is blocked until payment is resolved.">
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Credit deducted</span>
            <span className="font-medium text-zinc-500">No</span>
          </div>
          <OverrideForm projectId={id} alreadyOverridden={project.payment_override} />
        </div>
      </FocusCard>
    );
  } else if (isTerminal) {
    focusCard = (
      <FocusCard tone="green" title="Delivered" subtitle="PBDR sent to the client and delivery recipient.">
        <div className="space-y-3">
          {pbdrFiles.map((f) => (
            <DownloadCard
              key={f.id as string}
              href={`/api/download/pbdr/${id}`}
              filename={f.original_filename as string}
              originalFilename={f.original_filename as string}
              wrapperClassName="flex items-center justify-between rounded-md border border-green-200 bg-white px-3 py-2"
              buttonClassName="shrink-0 rounded-md border border-green-300 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
            >
              <p className="text-sm font-medium text-zinc-900">PBDR</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                v{f.version as number} · {new Date(f.created_at as string).toLocaleDateString("en-AU")}
              </p>
            </DownloadCard>
          ))}
          <p className="text-xs text-zinc-500">
            Resends a fresh 30-day download link to the submitter
            {project.delivery_recipient_email ? " and the delivery recipient" : ""}.
          </p>
          <ResendPbdrButton projectId={id} />
        </div>
      </FocusCard>
    );
  } else {
    focusCard = (
      <FocusCard tone="neutral" title="In progress" subtitle={STATUS_LABELS[project.status]}>
        <p className="text-sm text-zinc-500">Nothing needs your attention right now.</p>
      </FocusCard>
    );
  }

  // ── Left rail extras — persistent reference/edit cards for steps that are
  // already "done" on the rail but still legitimately reopenable. ───────────
  const leftRailExtras = (
    <>
      {project.project_number && (
        <AdminProjectNumberForm projectId={id} currentNumber={project.project_number} />
      )}
      {project.assigned && (
        <ConsultantCard
          projectId={id}
          consultants={consultants}
          currentConsultantId={currentConsultantId}
          assignedName={assignedName}
          availability={project.assigned.availability}
          assignmentHistory={assignmentHistory}
        />
      )}
      {canRegeneratePbdb && pbdbFiles.length > 0 && (
        <PbdbVersionsCard
          id="pbdb-section"
          projectId={id}
          files={pbdbFiles as { id: string; original_filename: string; version: number; created_at: string }[]}
          projectStatus={project.status}
          canRegenerate={canRegeneratePbdb}
        />
      )}
    </>
  );

  // ── Details tab ─────────────────────────────────────────────────────────────
  const detailsTab = (
    <>
      <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
        <Row label="Client" value={project.clients?.name ?? "No organisation"} />
        <Row label="PO number" value={project.po_number ?? "—"} />
        <Row label="Delivery recipient" value={project.delivery_recipient_email ?? "—"} />
        <Row label="Submitted via" value={project.source === "email" ? "Email" : "Portal"} />
      </div>
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
    </>
  );

  // ── Documents tab ────────────────────────────────────────────────────────────
  const documentsTab = (
    <>
      <CollapsibleSection title="Documents" defaultOpen>
        {files.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-400">No documents uploaded yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {files.map((f) => (
              <DownloadCard key={f.id as string} href={f.signedUrl} originalFilename={f.original_filename as string} external>
                <p className="text-sm font-medium text-zinc-900">
                  {FILE_TYPE_LABELS[f.file_type as string] ?? (f.file_type as string)}
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
          <p className="px-5 py-4 text-sm text-zinc-400">No evidence attached yet.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {evidenceFiles.map((f) => (
              <DownloadCard key={f.id as string} href={f.signedUrl} originalFilename={f.original_filename as string} external>
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

      {pbdbFiles.length > 0 && (
        <CollapsibleSection title="PBDB" subtitle="All generated versions." defaultOpen={false}>
          <div className="divide-y divide-zinc-100">
            {pbdbFiles.map((f, i) => {
              const version = f.version as number;
              const isLatest = i === pbdbFiles.length - 1;
              const showDispatchedBadge =
                isLatest &&
                (["dispatched", "revision_required"] as ProjectStatus[]).includes(project.status);
              return (
                <DownloadCard key={f.id as string} href={`/api/download/pbdb/${f.id as string}`} filename={f.original_filename as string}>
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900">{f.original_filename as string}</p>
                    {showDispatchedBadge && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Dispatched PBDB
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Version {version} · {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                  </p>
                </DownloadCard>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

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
                <p className="truncate text-sm font-medium text-zinc-900">PBDR</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Version {f.version as number} &middot; {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                </p>
              </DownloadCard>
            ))}
          </div>
        </CollapsibleSection>
      )}
    </>
  );

  // ── Stakeholders tab — read-only reference; actions live on the FocusCard
  // while dispatched, matching where they lived in the old admin workflow. ──
  const stakeholdersTab = (
    <>
      <CollapsibleSection
        title="Project stakeholders"
        subtitle="If set, these override the template- and org-level defaults for this project only. Leave empty to use the inherited list."
        defaultOpen={projectStakeholders.length > 0}
      >
        <ProjectStakeholderSection projectId={id} stakeholders={projectStakeholders} />
      </CollapsibleSection>

      {reviews.length === 0 ? (
        <p className="px-1 py-4 text-sm text-zinc-400">No stakeholder reviews yet.</p>
      ) : (
        <CollapsibleSection
          title="Stakeholder reviews"
          subtitle="Grouped by review cycle — each cycle corresponds to one version of the PBDB."
          defaultOpen
        >
          {reviewCycles.map((cycle) => {
            const cycleReviews = reviewsByCycle.get(cycle)!;
            const pbdbForCycle = pbdbFiles.find((f) => (f.version as number) === cycle);
            const isCurrent = cycle === project.review_cycle;
            return (
              <div key={cycle} className="border-b border-zinc-100 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2 bg-zinc-50 px-5 py-2.5">
                  <span className="text-xs font-semibold text-zinc-700">Cycle {cycle}</span>
                  {pbdbForCycle ? (
                    <span className="text-xs text-zinc-400">
                      · PBDB v{cycle} · {new Date(pbdbForCycle.created_at as string).toLocaleDateString("en-AU")}
                    </span>
                  ) : (
                    <span className="text-xs text-zinc-400">· PBDB v{cycle}</span>
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
                      approved_with_comments: { label: "Approved with comments", cls: "bg-green-100 text-green-700" },
                      rejected_with_comments: { label: "Rejected", cls: "bg-red-100 text-red-700" },
                      waived: { label: "Waived", cls: "bg-zinc-100 text-zinc-500" },
                    }[r.status] ?? { label: r.status, cls: "bg-zinc-100 text-zinc-500" };
                    return (
                      <div key={r.id} className="px-5 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-900">{r.stakeholder_name}</p>
                            <p className="text-xs text-zinc-500">{r.stakeholder_email}</p>
                            {r.comments && (
                              <p className="mt-2 text-sm leading-relaxed text-zinc-700 italic">
                                &ldquo;{r.comments}&rdquo;
                              </p>
                            )}
                            {r.waive_reason && (
                              <p className="mt-1 text-xs text-zinc-400">Waive reason: {r.waive_reason}</p>
                            )}
                          </div>
                          <div className="shrink-0 text-right">
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
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CollapsibleSection>
      )}
    </>
  );

  // ── Settings pill content — payment gate, delivery timing, client document
  // colour, pause/resume/delete. Previously a separate "Controls" tab. ──────
  const settingsContent = isDeleted ? (
    <p className="text-sm text-zinc-500">Project is in the recovery bin — controls are unavailable.</p>
  ) : (
    <>
      <div>
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
            <OverrideForm projectId={id} alreadyOverridden={project.payment_override} />
          </>
        )}
      </div>

      <div className="border-t border-zinc-100 pt-4">
        <h3 className="text-sm font-semibold text-zinc-900">Delivery timing</h3>
        <p className="mt-1 mb-3 text-xs leading-relaxed text-zinc-500">
          Delay before the PBDR goes out after final approval.
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
            Locks in once the last stakeholder approves.
          </p>
        )}
        {pendingDelivery && (
          <div className="mt-3">
            <PendingDeliveryPanel projectId={id} scheduledFor={pendingDelivery.scheduled_for} />
          </div>
        )}
      </div>

      {pbdbFiles.length > 0 && (
        <div className="border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-semibold text-zinc-900">Client document colour</h3>
          <p className="mt-1 mb-2 text-xs text-zinc-400">
            Black text, or the original red token colour, when the client downloads the PBDB.
          </p>
          <ProjectStripColorToggle projectId={id} initialValue={project.strip_token_color} />
        </div>
      )}

      {project.status === "paused" ? (
        <div className="border-t border-zinc-100 pt-4">
          <h3 className="mb-1 text-sm font-semibold text-zinc-900">Project controls</h3>
          <p className="text-xs text-zinc-500">Paused — resume from the panel on the left.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-red-100 bg-red-50/40 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-700">Danger zone</p>
          <div className="space-y-2">
            {!isTerminal && (
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
      )}
    </>
  );

  // ── Audit tab ────────────────────────────────────────────────────────────────
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

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Success banners */}
      {justSavedNumber && <NumberSavedBanner cleanUrl={`/admin/projects/${id}`} />}
      {justGeneratedPbdb && <PbdbGeneratedBanner cleanUrl={`/admin/projects/${id}`} />}
      {justAssigned && (
        <AdminSuccessBanner
          cleanUrl={`/admin/projects/${id}`}
          title="Consultant assigned"
          body="The consultant has been notified and the project is now in progress."
        />
      )}
      {justDispatched && (
        <AdminSuccessBanner
          cleanUrl={`/admin/projects/${id}`}
          title="Dispatched to stakeholders"
          body="Approval requests have been sent. Stakeholders will receive emails shortly."
        />
      )}
      {justPaused && (
        <AdminSuccessBanner
          cleanUrl={`/admin/projects/${id}`}
          title="Project paused"
          body="The project has been frozen. Resume it at any time from Settings."
        />
      )}
      {justResumed && (
        <AdminSuccessBanner
          cleanUrl={`/admin/projects/${id}`}
          title="Project resumed"
          body="The delivery date has been extended to account for the time paused."
        />
      )}
      {justPbdrResent && (
        <AdminSuccessBanner
          cleanUrl={`/admin/projects/${id}`}
          title="Delivery email resent"
          body="A fresh 30-day download link has been sent to the submitter."
        />
      )}
      {justPaymentOverridden && (
        <AdminSuccessBanner
          cleanUrl={`/admin/projects/${id}`}
          title="Payment override applied"
          body="The project has been flagged as Override — Payment Pending."
        />
      )}
      {justPaymentReconciled && (
        <AdminSuccessBanner
          cleanUrl={`/admin/projects/${id}`}
          title="Override reconciled"
          body="Payment has been marked as collected and the override flag has been cleared."
        />
      )}
      {justReviewWaived && (
        <AdminSuccessBanner
          cleanUrl={`/admin/projects/${id}`}
          title="Review waived"
          body="The stakeholder's review has been waived and the audit trail updated."
        />
      )}
      {justEmailUpdated && (
        <AdminSuccessBanner
          cleanUrl={`/admin/projects/${id}`}
          title="Email updated"
          body="The stakeholder's email has been updated and a fresh approval link has been resent."
        />
      )}

      {/* Breadcrumb */}
      <Link
        href={isDeleted ? "/admin/recovery" : "/admin/projects"}
        className="text-sm text-zinc-500 hover:text-zinc-700"
      >
        {isDeleted ? "← Recovery bin" : "← Projects"}
      </Link>

      {/* Status banners */}
      {isDeleted && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">This project is in the recovery bin.</span>{" "}
          It will be permanently deleted after 30 days.{" "}
          <Link href="/admin/recovery" className="font-medium underline hover:text-amber-900">
            Go to recovery bin →
          </Link>
        </div>
      )}

      {project.status === "paused" && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-semibold">Project paused.</span>
          {pauseData.pause_reason && (
            <>{" "}<span className="text-amber-700">{pauseData.pause_reason}</span></>
          )}
        </div>
      )}

      {isOverdue && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
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
        settingsTitle="Project Config"
        auditTab={auditTab}
      />
    </div>
  );
}
