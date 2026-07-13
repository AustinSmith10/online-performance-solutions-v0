import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssignForm, type ConsultantOption } from "./_components/AssignForm";
import { OverrideForm } from "./_components/OverrideForm";
import { FileUploadForm } from "./_components/FileUploadForm";
import { WaiveForm } from "./_components/WaiveForm";
import { ResendTokenButton } from "./_components/ResendTokenButton";
import { UpdateEmailForm } from "./_components/UpdateEmailForm";
import { ProjectStakeholderSection } from "./_components/ProjectStakeholderSection";
import { ConvertButton } from "./_components/ConvertButton";
import { DispatchButton } from "./_components/DispatchButton";
import { ResendPbdrButton } from "./_components/ResendPbdrButton";
import { PauseForm } from "./_components/PauseForm";
import { ResumeButton } from "./_components/ResumeButton";
import { AdminDeleteButton } from "./_components/AdminDeleteButton";
import { AdminProjectNumberForm } from "./_components/AdminProjectNumberForm";
import { AdminProjectTabs } from "./_components/AdminProjectTabs";
import { prettifyToken } from "@/lib/tokens/prettify";
import { ProjectStripColorToggle } from "@/components/ProjectStripColorToggle";
import { ProjectDeliveryDelayPresetSelect } from "@/components/ProjectDeliveryDelayPresetSelect";
import type { DeliveryDelayPreset } from "@/lib/delivery/delivery-delay";
import { DownloadCard } from "@/components/DownloadCard";
import { AttachEvidenceForm } from "@/components/AttachEvidenceForm";
import { GeneratePbdbButton, RegeneratePbdbButton } from "@/components/PbdbGenerationButtons";
import { NumberSavedBanner } from "@/components/NumberSavedBanner";
import { AdminSuccessBanner } from "@/components/AdminSuccessBanner";
import { HighlightRing } from "@/components/HighlightRing";
import { ProjectNumberForm as ConsultantProjectNumberForm } from "@/app/(consultant)/ops/projects/[id]/_components/ProjectNumberForm";
import { PbdbQaUploadForm } from "@/app/(consultant)/ops/projects/[id]/_components/PbdbQaUploadForm";
import { StepIndicator as ConsultantStepIndicator } from "@/app/(consultant)/ops/projects/[id]/_components/StepIndicator";
import { ProjectDetailsEditor } from "@/app/(consultant)/ops/projects/[id]/_components/ProjectDetailsEditor";
import { ProjectAuditTrail, type ProjectAuditRow } from "@/app/(consultant)/ops/projects/[id]/_components/ProjectAuditTrail";
import { PROJECT_AUDIT_EXCLUDED_EVENTS } from "@/lib/audit/project-scope";
import type { ProjectStatus, ConsultantAvailability, StakeholderReview } from "@/types";

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

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
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
  const justEmailUpdated = sp.email_updated ?? null;

  const initialTab: "overview" | "admin_workflow" | "consultant_workflow" | "controls" =
    justSavedNumber || justAssigned || justDispatched || justPbdrResent || justReviewWaived || justEmailUpdated
      ? "admin_workflow"
      : justPaused || justResumed || justPaymentOverridden || justPaymentReconciled
      ? "controls"
      : "overview";

  const supabase = createAdminClient();

  const [projectResult, consultantsResult] = await Promise.all([
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
        clients(id, name, client_config),
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
  ]);

  if (projectResult.error) console.error(`[admin/projects/${id}] project query failed:`, projectResult.error);
  if (!projectResult.data) notFound();

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
    clients: { id: string; name: string; client_config: Record<string, string> } | null;
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
  ]);

  const auditEntries = (rawFullAuditEntries ?? []) as ProjectAuditRow[];

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

  // ── Step locking logic ──────────────────────────────────────────────────────
  const step1Completed = !!project.project_number;
  const step2Locked = !project.project_number;
  const canRegeneratePbdb = (["assigned", "in_progress"] as ProjectStatus[]).includes(project.status);
  const step3Locked = !step1Completed;
  const step3Completed = !!project.assigned;
  const step4Locked = !step3Completed;
  const step4Completed =
    (project.status === "dispatched" && allCurrentAcknowledged) ||
    project.status === "converting" ||
    isTerminal;
  const step5Locked = !step4Completed;
  const step5Completed = project.status === "converting" || isTerminal;

  // ── Consultant-workflow tab state (mirrors app/(consultant)/ops/projects/[id]/page.tsx) ──
  const latestPbdb = pbdbFiles[pbdbFiles.length - 1] ?? null;
  const currentCycleComments = currentCycleReviews.filter((r) => r.comments);
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

  // ── Page title ──────────────────────────────────────────────────────────────
  const pageTitle = (() => {
    const addr = extractedFields["EXTRACT_ADDRESS"] as string | undefined;
    if (project.project_number && addr) return `${project.project_number} — ${addr}`;
    if (addr) return addr;
    return project.po_number ? `PO ${project.po_number}` : project.id.slice(0, 8);
  })();

  // ── Tab: Overview ───────────────────────────────────────────────────────────
  // Client / submitted-via / PO number / delivery recipient / expected delivery /
  // created now live in the header card (see #39) instead of a duplicate box here.
  const overviewContent = (
    <div className="project-two-col">
      {/* Left column: metadata */}
      <div className="min-w-0 space-y-6">
        {/* Documents */}
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Documents</h2>
          </div>
          {files.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500">No documents uploaded yet.</p>
          ) : (
            <div className="divide-y divide-zinc-100">
              {files.map((f) => (
                <DownloadCard
                  key={f.id as string}
                  href={f.signedUrl}
                  originalFilename={f.original_filename as string}
                  external
                >
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
        </div>

        {/* Evidence & correspondence — see #57 */}
        <div className="rounded-lg border border-zinc-200 bg-white">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">Evidence & correspondence</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Forwarded emails, screenshots, or other proof attached to this project
            </p>
          </div>
          {evidenceFiles.length === 0 ? (
            <p className="px-5 py-6 text-sm text-zinc-500">No evidence attached yet.</p>
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
          {!isDeleted && (
            <div className="border-t border-zinc-100 px-5 py-4">
              <AttachEvidenceForm projectId={id} />
            </div>
          )}
        </div>

        {/* Client document colour */}
        {pbdbFiles.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <h2 className="mb-1 text-sm font-semibold text-zinc-900">Client document colour</h2>
            <p className="mb-4 text-xs text-zinc-500">
              Controls whether the client receives a version with black text or the original red
              token colour when they download the PBDB via their review link.
            </p>
            <ProjectStripColorToggle projectId={id} initialValue={project.strip_token_color} />
          </div>
        )}

        {/* Delivery delay preset */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">Delivery timing</h2>
          <p className="mb-4 text-xs text-zinc-500">
            Delay applied to PBDR generation and final client delivery, on top of business-hours
            gating. Doesn&apos;t affect the earlier stakeholder-review dispatch step.
          </p>
          <ProjectDeliveryDelayPresetSelect
            projectId={id}
            initialValue={project.delivery_delay_preset}
          />
        </div>

        {/* PBDR files — reference list */}
        {pbdrFiles.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-900">PBDR</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Final converted document delivered to the client.</p>
            </div>
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
                    Version {f.version as number} &middot;{" "}
                    {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                  </p>
                </DownloadCard>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right column: content */}
      <div className="min-w-0 space-y-6">
        {/* Submitted details / Client values — same read-only-with-pencil-edit
            component the consultant workflow uses, see #38. */}
        <ProjectDetailsEditor
          projectId={id}
          poNumber={project.po_number}
          fieldEntries={clientFieldEntries}
          orgEntries={orgTokenEntries}
        />

        {/* Stakeholder review history */}
        {reviews.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-900">Stakeholder reviews</h2>
              <p className="mt-0.5 text-xs text-zinc-500">
                Grouped by review cycle — each cycle corresponds to one version of the PBDB.
              </p>
            </div>
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
                        · PBDB v{cycle}
                        · {new Date(pbdbForCycle.created_at as string).toLocaleDateString("en-AU")}
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
          </div>
        )}
      </div>
    </div>
  );

  // ── Tab: Consultant Workflow ────────────────────────────────────────────────
  // Mirrors app/(consultant)/ops/projects/[id]/page.tsx `stepsContent` exactly —
  // same components, same step states — so admins see precisely what the
  // assigned consultant sees.
  const consultantWorkflowContent = (
    <div className="space-y-3">
      {/* Step 1: Set project number */}
      <ConsultantProjectNumberForm projectId={id} projectNumber={project.project_number} />

      {/* Step 2: Generate PBDB */}
      <div className={`rounded-lg border ${step2Locked ? "border-zinc-200 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 last:border-b-0">
          <ConsultantStepIndicator step={2} completed={false} locked={step2Locked} />
          <h3 className={`text-sm font-semibold ${step2Locked ? "text-zinc-400" : "text-zinc-900"}`}>
            PBDB
          </h3>
        </div>
        {step2Locked ? (
          <p className="px-5 py-4 text-sm text-zinc-400">
            Set the project number first to unlock PBDB generation.
          </p>
        ) : pbdbFiles.length === 0 ? (
          <div className="px-5 py-4">
            <GeneratePbdbButton projectId={id} />
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pbdbFiles.map((f, i) => {
              const version = f.version as number;
              const isLatest = i === pbdbFiles.length - 1;
              const showDispatchedBadge =
                isLatest &&
                (["dispatched", "revision_required"] as ProjectStatus[]).includes(
                  project.status as ProjectStatus
                );
              return (
                <DownloadCard
                  key={f.id as string}
                  id={showDispatchedBadge ? "consultant-qa-pbdb-row" : undefined}
                  href={`/api/download/pbdb/${f.id as string}`}
                  filename={f.original_filename as string}
                  wrapperClassName="flex items-center justify-between px-5 py-3 transition-shadow duration-700"
                >
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900">{f.original_filename as string}</p>
                    {showDispatchedBadge && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Dispatched PBDB
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    v{version} · {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                  </p>
                </DownloadCard>
              );
            })}
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              {canRegeneratePbdb && (
                <p className="text-xs text-zinc-500">
                  Need to fix something? Regenerating creates a new version — existing versions are kept.
                </p>
              )}
              <RegeneratePbdbButton
                projectId={id}
                disabledMessage={
                  canRegeneratePbdb
                    ? undefined
                    : "Regeneration is only available before the PBDB is dispatched to stakeholders."
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Step 3: PBDB completion & approval — transforms through Locked / Upload / Pending / Revision / Approved */}
      <div className={`rounded-lg border ${
        pbdbCardState === "locked"
          ? "border-zinc-200 bg-zinc-50"
          : pbdbCardState === "approved"
          ? "border-green-200 bg-green-50"
          : "border-zinc-200 bg-white"
      }`}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100 last:border-b-0">
          <ConsultantStepIndicator step={3} completed={pbdbCardState === "approved"} locked={pbdbCardState === "locked"} />
          <h3 className={`text-sm font-semibold ${
            pbdbCardState === "locked"
              ? "text-zinc-400"
              : pbdbCardState === "approved"
              ? "text-green-800"
              : "text-zinc-900"
          }`}>
            PBDB completion &amp; approval
          </h3>
          {pbdbCardState === "pending" && (
            <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Awaiting {pendingReviews.length} of {currentCycleReviews.length} approvals
            </span>
          )}
          {pbdbCardState === "revision" && (
            <span className="ml-auto shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Revision required
            </span>
          )}
          {pbdbCardState === "approved" && (
            <span className="ml-auto shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              {project.status === "converting" ? "Converting…" : "Approved"}
            </span>
          )}
        </div>

        {pbdbCardState === "locked" && (
          <p className="px-5 py-4 text-sm text-zinc-400">
            Waiting for the PBDB to be generated.
          </p>
        )}

        {pbdbCardState === "upload" && (
          <div className="px-5 py-4">
            <PbdbQaUploadForm projectId={id} />
          </div>
        )}

        {pbdbCardState === "pending" && (
          <div className="px-5 py-4 space-y-4">
            <div className="flex items-center gap-2 rounded-md border border-blue-100 bg-blue-50 px-4 py-3">
              <svg className="h-4 w-4 shrink-0 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.59L7.3 9.24a.75.75 0 00-1.1 1.02l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-blue-700">PBDB dispatched — awaiting stakeholder responses.</p>
            </div>
            <PbdbQaUploadForm
              projectId={id}
              submitLabel="Upload new version"
              requireConfirmation
              confirmCopy={UPLOAD_NEW_VERSION_COPY}
            />
          </div>
        )}

        {pbdbCardState === "revision" && (
          <div className="px-5 py-4 space-y-4">
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
            />
          </div>
        )}

        {pbdbCardState === "approved" && (
          <div className="px-5 py-4">
            {project.status === "converting" ? (
              <p className="text-xs text-green-700">
                All stakeholders approved — converting to PBDR.
              </p>
            ) : pbdrFiles.length > 0 ? (
              <div className="space-y-3">
                <p className="text-xs font-medium text-green-800">PBDR ready for download</p>
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
            ) : null}
          </div>
        )}
      </div>
    </div>
  );

  // ── Tab: Admin Workflow ─────────────────────────────────────────────────────
  const adminWorkflowContent = (
    <div className="space-y-3">
      {/* Step 1: Set project number */}
      <div id="pbdb-section">
        <StepCard
          step={1}
          title="Set project number"
          completed={step1Completed}
          completedChildren={<AdminProjectNumberForm projectId={id} currentNumber={project.project_number} />}
        >
          <AdminProjectNumberForm projectId={id} currentNumber={project.project_number} />
        </StepCard>
      </div>

      {/* Step 2: Generate PBDB */}
      <div className={`rounded-lg border ${step2Locked ? "border-zinc-200 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
        <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4 last:border-b-0">
          <StepIndicator step={2} completed={false} locked={step2Locked} />
          <h3 className={`text-sm font-semibold ${step2Locked ? "text-zinc-400" : "text-zinc-900"}`}>
            PBDB
          </h3>
        </div>
        {step2Locked ? (
          <p className="px-5 py-4 text-sm text-zinc-400">
            Set the project number first to unlock PBDB generation.
          </p>
        ) : pbdbFiles.length === 0 ? (
          <div className="px-5 py-4">
            <GeneratePbdbButton projectId={id} />
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pbdbFiles.map((f, i) => {
              const version = f.version as number;
              const isLatest = i === pbdbFiles.length - 1;
              const showDispatchedBadge =
                isLatest &&
                (["dispatched", "revision_required"] as ProjectStatus[]).includes(
                  project.status as ProjectStatus
                );
              return (
                <DownloadCard
                  key={f.id as string}
                  href={`/api/download/pbdb/${f.id as string}`}
                  filename={f.original_filename as string}
                >
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900">{f.original_filename as string}</p>
                    {showDispatchedBadge && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Dispatched PBDB
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Version {version}
                    {" · "}{new Date(f.created_at as string).toLocaleDateString("en-AU")}
                  </p>
                </DownloadCard>
              );
            })}
            <div className="flex items-center justify-between gap-3 px-5 py-3">
              {canRegeneratePbdb && (
                <p className="text-xs text-zinc-500">
                  Need to fix something? Regenerating creates a new version — existing versions are kept.
                </p>
              )}
              <RegeneratePbdbButton
                projectId={id}
                disabledMessage={
                  canRegeneratePbdb
                    ? undefined
                    : "Regeneration is only available before the PBDB is dispatched to stakeholders."
                }
              />
            </div>
          </div>
        )}
      </div>

      {/* Step 3: Assign consultant */}
      <StepCard
        step={3}
        title="Assign consultant"
        completed={step3Completed}
        locked={step3Locked}
        completedNote={isTerminal ? undefined : assignedName ? `Assigned to ${assignedName}` : undefined}
        completedChildren={
          isTerminal ? (
            assignmentHistory.length > 0 ? (
              <div className="space-y-2">
                {assignmentHistory.map((a, idx) => {
                  const isFinal = idx === assignmentHistory.length - 1;
                  const activeUntilStatus = isFinal
                    ? project.status
                    : (assignmentHistory[idx + 1].projectStatusAtAssignment as ProjectStatus | null);
                  return (
                    <div
                      key={`${a.consultantId}-${idx}`}
                      className="flex items-center justify-between gap-4 rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900">{a.consultantName}</p>
                        <p className="text-xs text-zinc-500">
                          {isFinal ? "Final assignee" : "Previously assigned"} &middot;{" "}
                          {new Date(a.assignedAt).toLocaleDateString("en-AU", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                          {activeUntilStatus && (
                            <> &middot; until <span className="font-medium text-zinc-700">{STATUS_LABELS[activeUntilStatus] ?? activeUntilStatus}</span></>
                          )}
                        </p>
                      </div>
                      {isFinal && (
                        <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          Completed
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : project.assigned ? (
              <div className="flex items-center justify-between rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3">
                <p className="text-sm font-medium text-zinc-900">{assignedName}</p>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Completed</span>
              </div>
            ) : null
          ) : (
            <div>
              {project.assigned && (
                <p className="mb-4 text-sm text-zinc-500">
                  Currently assigned to{" "}
                  <strong className="text-zinc-800">{assignedName}</strong>{" "}
                  &mdash;{" "}
                  <span className={`font-medium ${
                    project.assigned.availability === "available" ? "text-green-700"
                    : project.assigned.availability === "on_leave" ? "text-yellow-700"
                    : "text-zinc-500"
                  }`}>
                    {AVAILABILITY_LABELS[project.assigned.availability]}
                  </span>
                </p>
              )}
              <AssignForm
                projectId={id}
                consultants={consultants}
                currentConsultantId={currentConsultantId}
                isReassign={!!project.assigned}
              />
              {consultants.length === 0 && (
                <p className="mt-3 text-sm text-zinc-400">
                  No consultants available.{" "}
                  <Link href="/admin/users/invite" className="underline hover:text-zinc-700">
                    Create account →
                  </Link>
                </p>
              )}
            </div>
          )
        }
      >
        {/* First assignment — only shown when step3 is active (not completed, not locked) */}
        <AssignForm
          projectId={id}
          consultants={consultants}
          currentConsultantId=""
          isReassign={false}
        />
        {consultants.length === 0 && (
          <p className="mt-3 text-sm text-zinc-400">
            No consultants available.{" "}
            <Link href="/admin/users/invite" className="underline hover:text-zinc-700">
              Create account →
            </Link>
          </p>
        )}
      </StepCard>

      {/* Step 4: Dispatch to stakeholders */}
      <StepCard
        step={4}
        title="Dispatch to stakeholders"
        completed={step4Completed}
        locked={step4Locked}
        completedNote="All stakeholders have acknowledged."
      >
        {(project.status === "assigned" ||
          (project.status === "in_progress" && !project.qa_completed_by)) && (
          <p className="text-sm text-zinc-500">
            Awaiting the assigned consultant to complete and upload the PBDB.
          </p>
        )}

        {project.status === "in_progress" && !!project.qa_completed_by && (
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">
              The consultant has uploaded the completed PBDB. Dispatch it to stakeholders for approval.
            </p>
            <DispatchButton projectId={id} />
          </div>
        )}

        {project.status === "dispatched" && pendingReviews.length > 0 && (
          <div className="space-y-4">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">
              Pending responses ({pendingReviews.length})
            </p>
            <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {pendingReviews.map((r) => {
                const inner = (
                  <div className="space-y-3 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-900">{r.stakeholder_name}</p>
                        <p className="text-xs text-zinc-500">{r.stakeholder_email}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Pending
                      </span>
                    </div>
                    <div className="space-y-2">
                      <ResendTokenButton reviewId={r.id} projectId={id} />
                      <UpdateEmailForm reviewId={r.id} projectId={id} currentEmail={r.stakeholder_email} />
                      <WaiveForm reviewId={r.id} projectId={id} stakeholderName={r.stakeholder_name} />
                    </div>
                  </div>
                );
                return (
                  <div key={r.id}>
                    {justEmailUpdated === r.id ? <HighlightRing>{inner}</HighlightRing> : inner}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {project.status === "revision_required" && (
          <div className="space-y-3">
            <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-900">Revision requested</p>
              <p className="mt-0.5 text-xs text-red-700">
                Stakeholders requested changes. The consultant must upload a corrected PBDB.
              </p>
            </div>
            {currentCycleReviews.filter((r) => r.comments).map((r) => (
              <div key={r.id} className="rounded-md border border-red-100 bg-red-50 px-4 py-3">
                <p className="text-xs font-semibold text-red-800">{r.stakeholder_name}</p>
                <p className="mt-1 text-sm leading-relaxed text-red-700">{r.comments}</p>
              </div>
            ))}
          </div>
        )}
      </StepCard>

      {/* Step 5: PBDR conversion */}
      <StepCard
        step={5}
        title="PBDR conversion"
        completed={step5Completed}
        locked={step5Locked}
        completedNote={
          project.status === "converting"
            ? "Conversion in progress — this may take a moment."
            : "PBDR delivered to client."
        }
        completedChildren={
          pbdrFiles.length > 0 ? (
            <div className="space-y-4">
              <div className="divide-y divide-zinc-100 rounded-md border border-zinc-100">
                {pbdrFiles.map((f) => (
                  <DownloadCard
                    key={f.id as string}
                    href={`/api/download/pbdr/${id}`}
                    filename={f.original_filename as string}
                    originalFilename={f.original_filename as string}
                    wrapperClassName="flex items-center gap-3 px-4 py-3"
                  >
                    <p className="truncate text-sm font-medium text-zinc-900">PBDR</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Version {f.version as number} &middot;{" "}
                      {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                    </p>
                  </DownloadCard>
                ))}
              </div>
              {(project.status === "delivered" || project.status === "complete") && (
                <div>
                  <p className="mb-2 text-xs text-zinc-500">
                    Resends a fresh 30-day download link to the submitter
                    {project.delivery_recipient_email ? " and the delivery recipient" : ""}.
                  </p>
                  <ResendPbdrButton projectId={id} />
                </div>
              )}
            </div>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-zinc-500">
            All stakeholders have acknowledged. Both gates must pass before converting:
            credit deducted or override applied, and all reviews acknowledged.
          </p>
          <ConvertButton projectId={id} />
        </div>
      </StepCard>
    </div>
  );

  // ── Tab: Controls ───────────────────────────────────────────────────────────
  const controlsContent = (
    <div className="space-y-6">
      {isDeleted && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-500">
          Project is in the recovery bin — controls are unavailable.
        </div>
      )}

      {!isDeleted && (
        <div className="project-two-col">
          {/* Left column: payment gate + project controls */}
          <div className="min-w-0 space-y-6">
            {/* Payment gate */}
            <div className="relative rounded-lg border border-zinc-200 bg-white p-5">
              {project.status === "paused" && (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-[2px]">
                  <p className="text-sm font-medium text-zinc-500">Payment override disabled while project is paused</p>
                </div>
              )}
              <h2 className="mb-1 text-sm font-semibold text-zinc-900">Payment gate</h2>
              <div className="mb-4 flex gap-6 text-sm">
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
                <div className="mb-4 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <span className="font-medium">Override reason: </span>
                  {project.payment_override_reason}
                </div>
              )}
              <OverrideForm projectId={id} alreadyOverridden={project.payment_override} />
            </div>

            {/* Pause / Resume / Delete */}
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="mb-4 text-sm font-semibold text-zinc-900">Project controls</h2>

              {project.status === "paused" ? (
                <div>
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Resume project
                  </p>
                  <ResumeButton projectId={id} daysPaused={daysPaused} />
                </div>
              ) : !isTerminal && (
                <div className="mb-5">
                  <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Pause project
                  </p>
                  <p className="mb-3 text-xs text-zinc-500">
                    Freezes the project at its current stage. The delivery date will be pushed
                    forward by the number of days paused when resumed.
                  </p>
                  <PauseForm projectId={id} />
                </div>
              )}

              {project.status !== "paused" && !isTerminal && (
                <div className="mt-5 border-t border-zinc-100 pt-5" />
              )}

              <div className={project.status === "paused" ? "mt-5 border-t border-zinc-100 pt-5" : ""}>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                  Delete project
                </p>
                <p className="mb-3 text-xs text-zinc-500">
                  Moves the project to the recovery bin. Permanently purged after 30 days.
                </p>
                <AdminDeleteButton projectId={id} />
              </div>
            </div>
          </div>

          {/* Right column: project stakeholders */}
          <div className="min-w-0">
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <h2 className="mb-1 text-sm font-semibold text-zinc-900">Project stakeholders</h2>
              <p className="mb-4 text-xs text-zinc-500">
                If set, these override the template- and org-level defaults for this project only.
                Leave empty to use the inherited list.
              </p>
              <ProjectStakeholderSection projectId={id} stakeholders={projectStakeholders} />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const auditContent = (
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
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Success banners */}
      {justSavedNumber && <NumberSavedBanner cleanUrl={`/admin/projects/${id}`} />}
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
          body="The project has been frozen. Resume it at any time from the Controls tab."
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

      {/* Header card */}
      <div className={`rounded-xl border border-zinc-200 border-l-[3px] ${STATUS_ACCENT[project.status]} bg-white p-5`}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-base font-semibold text-zinc-900">{pageTitle}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            project.status === "paused" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600"
          }`}>
            {STATUS_LABELS[project.status]}
          </span>
          {project.payment_override && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Override — Payment Pending
            </span>
          )}
          {isOverdue && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Overdue
            </span>
          )}
          {isDeleted && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
              Deleted
            </span>
          )}
        </div>
        <p className="mt-3.5 border-t border-zinc-100 pt-3 text-sm leading-relaxed text-zinc-500">
          {project.clients?.name ?? "No organisation"}
          {" · "}
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
            project.source === "email" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
          }`}>
            {project.source === "email" ? "Email" : "Portal"}
          </span>
          {" · "}Assigned to{" "}
          <span className={`font-medium ${assignedName ? "text-zinc-900" : "text-amber-700"}`}>
            {assignedName ?? "Unassigned"}
          </span>
          {" · "}Review cycle <span className="font-medium text-zinc-900">{project.review_cycle}</span>
          {" · "}Submitted{" "}
          <span className="font-medium text-zinc-900">
            {new Date(project.created_at).toLocaleDateString("en-AU")}
          </span>
          {" · "}Due{" "}
          <span className={`font-medium ${isOverdue ? "text-red-600" : "text-zinc-900"}`}>
            {project.expected_delivery_date
              ? new Date(project.expected_delivery_date).toLocaleDateString("en-AU")
              : "—"}
          </span>
          {" · "}PO number{" "}
          <span className="font-medium text-zinc-900">{project.po_number ?? "—"}</span>
          {" · "}Delivery recipient{" "}
          <span className="font-medium text-zinc-900">{project.delivery_recipient_email ?? "—"}</span>
        </p>
      </div>

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
            ? "No consultant has been assigned — go to the Admin Workflow tab to assign one."
            : project.status === "dispatched" && pendingReviews.length > 0
            ? `${pendingReviews.length} stakeholder${pendingReviews.length !== 1 ? "s" : ""} yet to respond — manage from the Admin Workflow tab.`
            : project.status === "revision_required"
            ? "A revision has been requested — the consultant must upload a corrected document."
            : `Expected delivery date has passed.`}
        </div>
      )}

      <AdminProjectTabs
        initialTab={initialTab}
        overview={overviewContent}
        adminWorkflow={adminWorkflowContent}
        consultantWorkflow={consultantWorkflowContent}
        controls={controlsContent}
        audit={auditContent}
      />
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StepIndicator({
  step,
  completed,
  locked,
}: {
  step: number;
  completed: boolean;
  locked?: boolean;
}) {
  if (completed) {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500 text-white text-xs font-semibold">
        ✓
      </div>
    );
  }
  if (locked) {
    return (
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-zinc-400 text-xs font-semibold">
        {step}
      </div>
    );
  }
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white text-xs font-semibold">
      {step}
    </div>
  );
}

function StepCard({
  step,
  title,
  completed,
  locked,
  completedNote,
  completedChildren,
  children,
}: {
  step: number;
  title: string;
  completed: boolean;
  locked?: boolean;
  completedNote?: string;
  completedChildren?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const isActive = !completed && !locked;

  return (
    <div className={`rounded-lg border ${
      completed ? "border-green-200 bg-green-50" : locked ? "border-zinc-200 bg-zinc-50" : "border-zinc-200 bg-white"
    }`}>
      <div className={`flex items-center gap-3 px-5 py-4 ${
        isActive || (completed && completedChildren) ? "border-b border-zinc-100" : ""
      }`}>
        <StepIndicator step={step} completed={completed} locked={locked} />
        <h3 className={`text-sm font-semibold ${
          completed ? "text-green-800" : locked ? "text-zinc-400" : "text-zinc-900"
        }`}>
          {title}
        </h3>
      </div>
      {completed && completedNote && (
        <p className={`px-5 pb-4 text-xs text-green-700 ${completedChildren ? "" : "pt-3"}`}>
          {completedNote}
        </p>
      )}
      {completed && completedChildren && (
        <div className="px-5 py-4">{completedChildren}</div>
      )}
      {isActive && children && (
        <div className="px-5 py-4">{children}</div>
      )}
    </div>
  );
}
