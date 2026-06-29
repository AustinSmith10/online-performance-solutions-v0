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
import { prettifyToken } from "@/lib/tokens/prettify";
import { ProjectStripColorToggle } from "@/components/ProjectStripColorToggle";
import { PbdbDownloadButton } from "@/components/PbdbDownloadButton";
import { PbdrDownloadButton } from "@/components/PbdrDownloadButton";
import { NumberSavedBanner } from "@/components/NumberSavedBanner";
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

  // Fetch pause-specific columns separately — these only exist after migration 039.
  // If the migration hasn't been applied yet the query fails gracefully and we fall back to nulls.
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

  // Load template mappings, submission files, PBDB files, PBDR files, and stakeholder reviews in parallel
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
          .createSignedUrl(f.storage_path as string, 3600);
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

  // Group all reviews by cycle for the grouped history display
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {justSavedNumber && <NumberSavedBanner cleanUrl={`/admin/projects/${id}`} />}
      <div>
        <Link
          href={isDeleted ? "/admin/recovery" : "/admin/projects"}
          className="text-sm text-zinc-500 hover:text-zinc-700"
        >
          {isDeleted ? "← Recovery bin" : "← Projects"}
        </Link>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-zinc-900">
            {(() => {
              const addr = project.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined;
              if (project.project_number && addr) return `${project.project_number} — ${addr}`;
              if (addr) return addr;
              return project.po_number ? `PO ${project.po_number}` : project.id.slice(0, 8);
            })()}
          </h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            project.status === "paused"
              ? "bg-amber-100 text-amber-700"
              : "bg-zinc-100 text-zinc-600"
          }`}>
            {STATUS_LABELS[project.status]}
          </span>
          {project.payment_override && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              Override — Payment Pending
            </span>
          )}
        </div>
      </div>

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
          {pauseData.paused_previous_status && (
            <span className="ml-1 text-amber-600">
              — was {STATUS_LABELS[pauseData.paused_previous_status as ProjectStatus] ?? pauseData.paused_previous_status}.
            </span>
          )}
        </div>
      )}

      {/* Overdue action banner */}
      {isOverdue && (
        <div className="rounded-lg border border-red-200 bg-red-50">
          <div className="flex items-start gap-3 border-b border-red-100 px-5 py-4">
            <span className="mt-0.5 shrink-0 text-red-500">⚠</span>
            <div>
              <p className="text-sm font-semibold text-red-900">
                Overdue by {daysOverdue} day{daysOverdue !== 1 ? "s" : ""} — action required
              </p>
              <p className="mt-0.5 text-xs text-red-700">
                {project.status === "submitted"
                  ? "No consultant has been assigned. Assign one below to continue."
                  : project.status === "dispatched" && pendingReviews.length > 0
                  ? `${pendingReviews.length} stakeholder${pendingReviews.length !== 1 ? "s" : ""} yet to respond.`
                  : project.status === "dispatched" && !project.credit_deducted && !project.payment_override
                  ? "All stakeholders have acknowledged but payment has not been settled."
                  : project.status === "revision_required"
                  ? "A revision has been requested. The assigned consultant must update the document."
                  : `Project is ${STATUS_LABELS[project.status].toLowerCase()} — expected delivery date has passed.`}
              </p>
            </div>
          </div>

          {/* Action: assign consultant */}
          {project.status === "submitted" && (
            <div className="px-5 py-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-red-700">
                Assign a consultant
              </p>
              <AssignForm
                projectId={id}
                consultants={consultants}
                currentConsultantId={currentConsultantId}
                isReassign={false}
              />
              {consultants.length === 0 && (
                <p className="mt-3 text-sm text-zinc-500">
                  No consultants available.{" "}
                  <Link href="/admin/users/invite" className="underline hover:text-zinc-700">
                    Invite a consultant →
                  </Link>
                </p>
              )}
            </div>
          )}

          {/* Action: pending stakeholder responses */}
          {project.status === "dispatched" && pendingReviews.length > 0 && (
            <div className="divide-y divide-red-100">
              {pendingReviews.map((r) => (
                <div key={r.id} className="px-5 py-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
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
                    <UpdateEmailForm
                      reviewId={r.id}
                      projectId={id}
                      currentEmail={r.stakeholder_email}
                    />
                    <WaiveForm
                      reviewId={r.id}
                      projectId={id}
                      stakeholderName={r.stakeholder_name}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Action: payment override (dispatched, all acknowledged, payment pending) */}
          {project.status === "dispatched" &&
            pendingReviews.length === 0 &&
            !project.credit_deducted &&
            !project.payment_override && (
              <div className="px-5 py-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-red-700">
                  Apply payment override
                </p>
                <OverrideForm projectId={id} alreadyOverridden={false} />
              </div>
            )}

          {/* Action: dispatch to stakeholders (in_progress, dispatch failed) */}
          {project.status === "in_progress" && !!project.qa_completed_by && (
            <div className="px-5 py-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-red-700">
                Dispatch to stakeholders
              </p>
              <DispatchButton projectId={id} />
            </div>
          )}
        </div>
      )}

      {/* Project details */}
      <div className="rounded-lg border border-zinc-200 bg-white divide-y divide-zinc-100">
        <Row label="Organisation" value={project.organisations?.name ?? "—"} />
        <Row
          label="Submitted via"
          value={
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                project.source === "email"
                  ? "bg-green-100 text-green-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
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
        <Row
          label="Created"
          value={new Date(project.created_at).toLocaleDateString("en-AU")}
        />
      </div>

      {/* Submitted field values — editable by Super Admin */}
      <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-zinc-900">Field values</h2>
        <FieldsForm projectId={id} fields={fieldEntries} />
      </div>

      {/* PBDB — project number + generation + file history in one card */}
      {(!isDeleted && !isTerminal || pbdbFiles.length > 0) && (
        <div id="pbdb-section" className="rounded-lg border border-zinc-200 bg-white transition-shadow duration-700">
          <div className="border-b border-zinc-100 px-5 py-4">
            <h2 className="text-sm font-semibold text-zinc-900">PBDB</h2>
          </div>

          {/* Project number + generate — editable while project is live */}
          {!isDeleted && !isTerminal && (
            <div className={`px-5 py-4${pbdbFiles.length > 0 ? " border-b border-zinc-100" : ""}`}>
              <AdminProjectNumberForm
                projectId={id}
                currentNumber={project.project_number}
              />
            </div>
          )}

          {/* File history */}
          {pbdbFiles.length > 0 && (
            <div className="divide-y divide-zinc-100">
              {pbdbFiles.map((f) => {
                const version = f.version as number;
                const isQa = version >= 2;
                return (
                  <div
                    key={f.id as string}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-zinc-900">
                        {f.original_filename as string}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        Version {version}
                        {isQa ? " — QA corrected" : " — Generated"}
                        {" · "}
                        {new Date(f.created_at as string).toLocaleDateString("en-AU")}
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
      )}

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

      {/* Dispatch — standalone card when QA complete, regardless of overdue state */}
      {!isDeleted && project.status === "in_progress" && !!project.qa_completed_by && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">Dispatch failed — retry required</h2>
          <p className="mt-1 mb-4 text-sm text-amber-800">
            QA was marked complete but dispatch did not succeed. Retry to send approval requests to stakeholders.
          </p>
          <DispatchButton projectId={id} />
        </div>
      )}

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
              <div
                key={f.id as string}
                className="flex items-center justify-between px-5 py-3"
              >
                <div>
                  <p className="text-sm text-zinc-900">
                    {f.original_filename as string}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {FILE_TYPE_LABELS[f.file_type as string] ?? f.file_type}{" "}
                    &middot;{" "}
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

      {/* Assignment — locked once project is delivered/complete */}
      {!isDeleted && (
        <div id="assign" className="rounded-lg border border-zinc-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-900">Consultant assignment</h2>
            {isTerminal && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                Locked
              </span>
            )}
          </div>

          {isTerminal ? (
            assignmentHistory.length > 0 ? (
              <div className="space-y-2">
                {assignmentHistory.map((a, idx) => {
                  const isFinal = idx === assignmentHistory.length - 1;
                  // For previously assigned: the status when the next consultant was assigned
                  // tells us where this one left off. For the final: the project's current status.
                  const activeUntilStatus: ProjectStatus | null = isFinal
                    ? project.status
                    : (assignmentHistory[idx + 1].projectStatusAtAssignment as ProjectStatus | null);
                  const activeUntilLabel = activeUntilStatus ? (STATUS_LABELS[activeUntilStatus] ?? activeUntilStatus) : null;
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
                          {activeUntilLabel && (
                            <> &middot; until <span className="font-medium text-zinc-700">{activeUntilLabel}</span></>
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
              /* Fallback when audit history predates logging */
              <div className="flex items-center justify-between rounded-md border border-zinc-100 bg-zinc-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {[project.assigned.first_name, project.assigned.last_name].filter(Boolean).join(" ") || project.assigned.email}
                  </p>
                  <p className="text-xs text-zinc-500">Final assignee</p>
                </div>
                <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                  Completed
                </span>
              </div>
            ) : (
              <p className="text-sm text-zinc-400">No assignment record found.</p>
            )
          ) : (
            <>
              {project.assigned && (
                <p className="mb-4 text-sm text-zinc-500">
                  Currently assigned to{" "}
                  <strong className="text-zinc-800">
                    {[project.assigned.first_name, project.assigned.last_name]
                      .filter(Boolean)
                      .join(" ") || project.assigned.email}
                  </strong>{" "}
                  &mdash;{" "}
                  <span
                    className={`font-medium ${
                      project.assigned.availability === "available"
                        ? "text-green-700"
                        : project.assigned.availability === "on_leave"
                        ? "text-yellow-700"
                        : "text-zinc-500"
                    }`}
                  >
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
                  No consultants available. Invite a consultant from the{" "}
                  <Link href="/admin/users/invite" className="underline">
                    users page
                  </Link>
                  .
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* Stakeholder reviews — grouped by review cycle */}
      {!isDeleted && reviews.length > 0 && (
        <div id="stakeholders" className="rounded-lg border border-zinc-200 bg-white">
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
                {/* Cycle header */}
                <div className="flex flex-wrap items-center gap-2 bg-zinc-50 px-5 py-2.5">
                  <span className="text-xs font-semibold text-zinc-700">
                    Cycle {cycle}
                  </span>
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
                {/* Reviews in this cycle */}
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
                            <span
                              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.cls}`}
                            >
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
                        {r.status === "pending" && isCurrent && (
                          <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3">
                            <ResendTokenButton reviewId={r.id} projectId={id} />
                            <UpdateEmailForm
                              reviewId={r.id}
                              projectId={id}
                              currentEmail={r.stakeholder_email}
                            />
                            <WaiveForm
                              reviewId={r.id}
                              projectId={id}
                              stakeholderName={r.stakeholder_name}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PBDR conversion & delivery */}
      {!isDeleted && (
        project.status === "dispatched" ||
        project.status === "converting" ||
        project.status === "delivered" ||
        project.status === "complete"
      ) && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">PBDR conversion</h2>

          {/* Delivered PBDRs */}
          {pbdrFiles.length > 0 && (
            <div className="mb-4 divide-y divide-zinc-100 rounded-md border border-zinc-100">
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
                    <PbdrDownloadButton
                      href={f.signedUrl}
                      filename={f.original_filename as string}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Resend delivery email — available once delivered */}
          {pbdrFiles.length > 0 &&
            (project.status === "delivered" || project.status === "complete") && (
              <div className="mt-2">
                <p className="mb-2 text-xs text-zinc-500">
                  Resends a fresh 30-day download link to the submitter
                  {project.delivery_recipient_email ? " and the delivery recipient" : ""}.
                </p>
                <ResendPbdrButton projectId={id} />
              </div>
            )}

          {project.status === "converting" && (
            <p className="text-sm text-zinc-500">Conversion in progress…</p>
          )}

          {project.status === "complete" && pbdrFiles.length === 0 && (
            <p className="text-sm text-zinc-500">Delivered — PBDR file not found.</p>
          )}

          {project.status === "dispatched" && (
            allCurrentAcknowledged ? (
              <div>
                <p className="mb-3 text-sm text-zinc-500">
                  All stakeholders have acknowledged. Both hard gates must pass before the button
                  below becomes effective (credit deducted or override applied, and all reviews
                  acknowledged).
                </p>
                <ConvertButton projectId={id} />
              </div>
            ) : (
              <p className="text-sm text-zinc-500">
                Awaiting stakeholder responses —{" "}
                {currentCycleReviews.filter((r) => r.status === "pending").length} pending.
              </p>
            )
          )}
        </div>
      )}

      {/* Project-level stakeholder overrides */}
      {!isDeleted && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">Project stakeholders</h2>
          <p className="mb-4 text-xs text-zinc-500">
            If set, these override the template- and org-level defaults for this project only.
            Leave empty to use the inherited list.
          </p>
          <ProjectStakeholderSection projectId={id} stakeholders={projectStakeholders} />
        </div>
      )}

      {/* Project controls — pause / delete */}
      {!isDeleted && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-zinc-900">Project controls</h2>

          {project.status === "paused" ? (
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Resume project
              </p>
              <ResumeButton
                projectId={id}
                daysPaused={daysPaused}
              />
            </div>
          ) : !isTerminal && (
            <div className="mb-5">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                Pause project
              </p>
              <p className="mb-3 text-xs text-zinc-500">
                Freezes the project at its current stage. The delivery date will be
                pushed forward by the number of days paused when resumed.
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
      )}

      {/* Payment gate — hidden for deleted projects */}
      {!isDeleted && <div className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-semibold text-zinc-900">Payment gate</h2>

        <div className="mb-4 flex gap-6 text-sm">
          <span>
            <span className="text-zinc-500">Credit deducted: </span>
            <span
              className={
                project.credit_deducted
                  ? "font-medium text-green-700"
                  : "text-zinc-500"
              }
            >
              {project.credit_deducted ? "Yes" : "No"}
            </span>
          </span>
          {project.payment_override && (
            <span>
              <span className="text-zinc-500">Override applied: </span>
              <span className="font-medium text-amber-700">
                {project.payment_override_at
                  ? new Date(project.payment_override_at).toLocaleDateString(
                      "en-AU"
                    )
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

        <OverrideForm
          projectId={id}
          alreadyOverridden={project.payment_override}
        />
      </div>}
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
