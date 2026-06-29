import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { AssignForm, type ConsultantOption } from "./_components/AssignForm";
import { OverrideForm } from "./_components/OverrideForm";
import { FieldsForm } from "./_components/FieldsForm";
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
import { PbdbDownloadButton } from "@/components/PbdbDownloadButton";
import { PbdrDownloadButton } from "@/components/PbdrDownloadButton";
import { NumberSavedBanner } from "@/components/NumberSavedBanner";
import { AdminSuccessBanner } from "@/components/AdminSuccessBanner";
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

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

const FILE_TYPE_LABELS: Record<string, string> = {
  building_plans: "Building Plans",
  po: "Purchase Order",
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

  const initialTab: "overview" | "workflow" | "controls" =
    justSavedNumber || justAssigned || justDispatched || justPbdrResent
      ? "workflow"
      : justPaused || justResumed
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
        qa_completed_by,
        organisations(id, name),
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
    organisations: { id: string; name: string } | null;
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
    { data: rawPbdbFiles },
    { data: rawPbdrFiles },
    { data: rawReviews },
    { data: rawProjectStakeholders },
    { data: rawAssignments },
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
      .in("file_type", ["po", "building_plans", "additional"])
      .order("created_at"),
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
      .order("sort_order", { ascending: true }),
    supabase
      .from("audit_log")
      .select("metadata, created_at")
      .eq("project_id", id)
      .eq("event_type", "assignment.created")
      .order("created_at", { ascending: true }),
  ]);

  const [files, pbdrFiles] = await Promise.all([
    Promise.all(
      (rawSubmissionFiles ?? []).map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("submissions")
          .createSignedUrl(f.storage_path as string, 3600);
        return { ...f, signedUrl: signed?.signedUrl ?? null };
      })
    ),
    Promise.all(
      (rawPbdrFiles ?? []).map(async (f) => {
        const { data: signed } = await supabase.storage
          .from("documents")
          .createSignedUrl(f.storage_path as string, 3600, {
            download: (f.original_filename as string) || true,
          });
        return { ...f, signedUrl: signed?.signedUrl ?? null };
      })
    ),
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
  const fieldEntries = Object.entries(extractedFields).map(([token, value]) => ({
    token,
    label: labelMap.get(token) ?? prettifyToken(token),
    value: value as string,
  }));

  const assignedName = project.assigned
    ? [project.assigned.first_name, project.assigned.last_name].filter(Boolean).join(" ") || project.assigned.email
    : null;

  // ── Step locking logic ──────────────────────────────────────────────────────
  const step1Completed = !!project.project_number && pbdbFiles.length > 0;
  const step2Locked = pbdbFiles.length === 0;
  const step3Locked = !step1Completed;
  const step3Completed = !!project.assigned;
  const step4Locked = !step3Completed;
  const step4Completed =
    (project.status === "dispatched" && allCurrentAcknowledged) ||
    project.status === "converting" ||
    isTerminal;
  const step5Locked = !step4Completed;
  const step5Completed = project.status === "converting" || isTerminal;

  // ── Page title ──────────────────────────────────────────────────────────────
  const pageTitle = (() => {
    const addr = extractedFields["EXTRACT_ADDRESS"] as string | undefined;
    if (project.project_number && addr) return `${project.project_number} — ${addr}`;
    if (addr) return addr;
    return project.po_number ? `PO ${project.po_number}` : project.id.slice(0, 8);
  })();

  // ── Tab: Overview ───────────────────────────────────────────────────────────
  const overviewContent = (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
      {/* Left column: metadata */}
      <div className="space-y-6">
        {/* Project details */}
        <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
          <Row label="Organisation" value={project.organisations?.name ?? "—"} />
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
          <Row label="Delivery recipient" value={project.delivery_recipient_email ?? "—"} />
          <Row
            label="Expected delivery"
            value={
              project.expected_delivery_date
                ? new Date(project.expected_delivery_date).toLocaleDateString("en-AU")
                : "—"
            }
          />
          <Row label="Created" value={new Date(project.created_at).toLocaleDateString("en-AU")} />
        </div>

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
                <div key={f.id as string} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm text-zinc-900">{f.original_filename as string}</p>
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
                      className="ml-4 shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
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

        {/* PBDR files — reference list */}
        {pbdrFiles.length > 0 && (
          <div className="rounded-lg border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-zinc-900">PBDR</h2>
              <p className="mt-0.5 text-xs text-zinc-500">Final converted document delivered to the client.</p>
            </div>
            <div className="divide-y divide-zinc-100">
              {pbdrFiles.map((f) => (
                <div key={f.id as string} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-zinc-900">{f.original_filename as string}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Version {f.version as number} &middot;{" "}
                      {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  {f.signedUrl && (
                    <PbdrDownloadButton href={f.signedUrl} filename={f.original_filename as string} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right column: content */}
      <div className="space-y-6">
        {/* Field values */}
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Field values</h2>
          <FieldsForm projectId={id} fields={fieldEntries} />
        </div>

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
                        · PBDB v{cycle} ({(pbdbForCycle.version as number) >= 2 ? "QA corrected" : "Generated"})
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

  // ── Tab: Workflow ───────────────────────────────────────────────────────────
  const workflowContent = (
    <div className="space-y-3">
      {/* Step 1: Set project number */}
      <div id="pbdb-section">
        <StepCard
          step={1}
          title="Set project number"
          completed={step1Completed}
          completedNote={`Project number set: ${project.project_number}-S`}
        >
          <AdminProjectNumberForm projectId={id} currentNumber={project.project_number} />
        </StepCard>
      </div>

      {/* Step 2: Download PBDB */}
      <div className={`rounded-lg border ${step2Locked ? "border-zinc-200 bg-zinc-50" : "border-zinc-200 bg-white"}`}>
        <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4 last:border-b-0">
          <StepIndicator step={2} completed={false} locked={step2Locked} />
          <h3 className={`text-sm font-semibold ${step2Locked ? "text-zinc-400" : "text-zinc-900"}`}>
            Download PBDB
          </h3>
        </div>
        {step2Locked ? (
          <p className="px-5 py-4 text-sm text-zinc-400">
            Set the project number first — the PBDB will be generated automatically.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pbdbFiles.map((f) => {
              const version = f.version as number;
              return (
                <div key={f.id as string} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">{f.original_filename as string}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Version {version}{version >= 2 ? " — QA corrected" : " — Generated"}
                      {" · "}{new Date(f.created_at as string).toLocaleDateString("en-AU")}
                    </p>
                  </div>
                  <PbdbDownloadButton
                    href={`/api/download/pbdb/${f.id as string}`}
                    filename={f.original_filename as string}
                  />
                </div>
              );
            })}
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
                    Invite one →
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
              Invite one →
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
              {pendingReviews.map((r) => (
                <div key={r.id} className="space-y-3 px-4 py-3">
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
              ))}
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
                  <div key={f.id as string} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{f.original_filename as string}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Version {f.version as number} &middot;{" "}
                        {new Date(f.created_at as string).toLocaleDateString("en-AU")}
                      </p>
                    </div>
                    {f.signedUrl && (
                      <PbdrDownloadButton href={f.signedUrl} filename={f.original_filename as string} />
                    )}
                  </div>
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[2fr_3fr]">
          {/* Left column: payment gate + project controls */}
          <div className="space-y-6">
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
          <div>
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

      {/* Header */}
      <div>
        <Link
          href={isDeleted ? "/admin/recovery" : "/admin/projects"}
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          {isDeleted ? "← Recovery bin" : "← Projects"}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">{pageTitle}</h1>
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
        </div>
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
            ? "No consultant has been assigned — go to the Workflow tab to assign one."
            : project.status === "dispatched" && pendingReviews.length > 0
            ? `${pendingReviews.length} stakeholder${pendingReviews.length !== 1 ? "s" : ""} yet to respond — manage from the Workflow tab.`
            : project.status === "revision_required"
            ? "A revision has been requested — the consultant must upload a corrected document."
            : `Expected delivery date has passed.`}
        </div>
      )}

      <AdminProjectTabs
        initialTab={initialTab}
        overview={overviewContent}
        workflow={workflowContent}
        controls={controlsContent}
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

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4 px-5 py-3">
      <span className="w-44 shrink-0 text-sm text-zinc-500">{label}</span>
      <span className="text-sm text-zinc-900">{value}</span>
    </div>
  );
}
