import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DownloadCard } from "@/components/DownloadCard";
import { DeletedBanner } from "./_components/DeletedBanner";
import { RestoredBanner } from "./_components/RestoredBanner";
import { PendingReviewModal } from "./_components/PendingReviewModal";
import { ProjectCard } from "./_components/ProjectListRow";
import { resolveStepperState, type StepperResult } from "@/lib/delivery/stepper";
import type { ProjectStatus, PaymentMethod } from "@/types";

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

const READY_WINDOW_DAYS = 8;

type ProjectRow = {
  id: string;
  po_number: string | null;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  created_at: string;
  delivered_at: string | null;
  expected_delivery_date: string | null;
  review_cycle: number;
  paused_previous_status: ProjectStatus | null;
  pbdb_downloaded_at: string | null;
  assigned_consultant_id: string | null;
};

type OrgRow = {
  payment_method: PaymentMethod;
  credit_balance: number;
  show_consultant_name: boolean;
};

function projectLabel(p: Pick<ProjectRow, "extracted_fields" | "po_number" | "id">): string {
  return (
    (p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ??
    (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8))
  );
}

// Formatted server-side (not in the client row components) so hydration never re-runs
// Intl.DateTimeFormat in the browser — Node's and the browser's "en-AU" defaults can disagree.
function formatAuDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

// Count Mon–Fri days between fromIso and todayIso (exclusive of today)
function workingDaysElapsed(fromIso: string, todayIso: string): number {
  const start = new Date(fromIso.slice(0, 10) + "T00:00:00Z");
  const end = new Date(todayIso + "T00:00:00Z");
  let days = 0;
  const cur = new Date(start);
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const d = cur.getUTCDay();
    if (d !== 0 && d !== 6) days++;
  }
  return days;
}

export default async function ClientPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const justDeleted = sp.deleted === "1";
  const justRestored = sp.restored === "1";
  const user = await requireRole("stakeholder");
  const supabase = createAdminClient();
  const orgId = user.client_id as string;
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: projectsData }, { data: orgData }, { data: pendingReviewsData }] =
    await Promise.all([
      supabase
        .from("projects")
        .select(
          "id, po_number, extracted_fields, status, created_at, delivered_at, expected_delivery_date, review_cycle, paused_previous_status, pbdb_downloaded_at, assigned_consultant_id"
        )
        .eq("client_id", orgId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("clients")
        .select("payment_method, credit_balance, show_consultant_name")
        .eq("id", orgId)
        .single(),
      supabase
        .from("stakeholder_reviews")
        .select("id, project_id, token, expires_at")
        .eq("stakeholder_email", user.email as string)
        .eq("status", "pending"),
    ]);

  const projects = (projectsData ?? []) as unknown as ProjectRow[];
  const org = orgData as OrgRow | null;

  type PendingReview = { id: string; project_id: string; token: string; expires_at: string };
  const pendingReviewMap = new Map<string, PendingReview>(
    (pendingReviewsData ?? []).map((r) => [r.project_id as string, r as unknown as PendingReview])
  );
  const pendingApprovals = projects.filter((p) => pendingReviewMap.has(p.id));

  // Latest PBDB original_filename per project with a pending approval
  const pbdbFilenameMap = new Map<string, string>();
  if (pendingApprovals.length > 0) {
    const { data: pbdbFilesData } = await supabase
      .from("project_files")
      .select("project_id, original_filename, version")
      .in("project_id", pendingApprovals.map((p) => p.id))
      .eq("file_type", "pbdb")
      .order("version", { ascending: false });
    for (const row of pbdbFilesData ?? []) {
      const pid = row.project_id as string;
      if (!pbdbFilenameMap.has(pid)) pbdbFilenameMap.set(pid, row.original_filename as string);
    }
  }

  // Complete projects within the 8-working-day window
  const recentlyComplete = projects.filter((p) => {
    if (p.status !== "complete") return false;
    const from = p.delivered_at ?? p.created_at;
    return workingDaysElapsed(from, todayIso) < READY_WINDOW_DAYS;
  });

  // Check which of those this user has already downloaded
  const downloadedIds = new Set<string>();
  if (recentlyComplete.length > 0) {
    const { data: dlRows } = await supabase
      .from("audit_log")
      .select("project_id")
      .eq("event_type", "project.pbdr_downloaded")
      .eq("actor_id", user.id as string)
      .in(
        "project_id",
        recentlyComplete.map((p) => p.id)
      );
    for (const row of dlRows ?? []) downloadedIds.add(row.project_id as string);
  }

  // Ready banner: recently complete + not yet downloaded by this user
  const reportsReady = recentlyComplete.filter((p) => !downloadedIds.has(p.id));

  const PBDR_DOWNLOAD_LIMIT = 2;
  const PBDR_WINDOW_DAYS = 2;

  // Projects currently in delivered status
  const allDelivered = projects.filter((p) => p.status === "delivered");

  // Count how many times this user has downloaded the PBDR for each delivered project
  const pbdrDownloadCounts = new Map<string, number>();
  if (allDelivered.length > 0) {
    const { data: pbdrDlRows } = await supabase
      .from("audit_log")
      .select("project_id")
      .eq("event_type", "project.pbdr_downloaded")
      .eq("actor_id", user.id as string)
      .in("project_id", allDelivered.map((p) => p.id));
    for (const row of pbdrDlRows ?? []) {
      const id = row.project_id as string;
      pbdrDownloadCounts.set(id, (pbdrDownloadCounts.get(id) ?? 0) + 1);
    }
  }

  // Show banner only while within the download limit AND within the 2-working-day window
  const deliveredProjects = allDelivered.filter((p) => {
    if ((pbdrDownloadCounts.get(p.id) ?? 0) >= PBDR_DOWNLOAD_LIMIT) return false;
    const from = p.delivered_at ?? p.created_at;
    return workingDaysElapsed(from, todayIso) < PBDR_WINDOW_DAYS;
  });

  // Main table: exclude complete projects (they live in history or the ready banner)
  const activeProjects = projects.filter((p) => p.status !== "complete");

  // Consultant first names — for the "assessing"/"working on"/"applying changes" captions
  const consultantIds = [
    ...new Set(activeProjects.map((p) => p.assigned_consultant_id).filter((id): id is string => !!id)),
  ];
  const consultantNameMap = new Map<string, string | null>();
  if (consultantIds.length > 0) {
    const { data: consultantRows } = await supabase
      .from("users")
      .select("id, first_name")
      .in("id", consultantIds);
    for (const row of consultantRows ?? []) {
      consultantNameMap.set(row.id as string, row.first_name as string | null);
    }
  }

  // Real-status-only stepper state per row — draft has no stepper (stakeholders never see progress pre-submission)
  const stepperMap = new Map<string, StepperResult>();
  for (const p of activeProjects) {
    if (p.status === "draft") continue;
    stepperMap.set(
      p.id,
      resolveStepperState({
        status: p.status,
        pausedPreviousStatus: p.paused_previous_status,
        reviewCycle: p.review_cycle,
        pbdbDownloadedAt: p.pbdb_downloaded_at,
        showConsultantName: org?.show_consultant_name ?? true,
        consultantFirstName: p.assigned_consultant_id
          ? consultantNameMap.get(p.assigned_consultant_id) ?? null
          : null,
        viewerFirstName: (user.first_name as string | null) ?? null,
      })
    );
  }

  // Latest PBDR original_filename per project — shown under the download button
  const pbdrRelevantIds = [...new Set([...allDelivered, ...reportsReady].map((p) => p.id))];
  const pbdrFilenameMap = new Map<string, string>();
  if (pbdrRelevantIds.length > 0) {
    const { data: pbdrFilesData } = await supabase
      .from("project_files")
      .select("project_id, original_filename, version")
      .in("project_id", pbdrRelevantIds)
      .eq("file_type", "pbdr")
      .order("version", { ascending: false });
    for (const row of pbdrFilesData ?? []) {
      const pid = row.project_id as string;
      if (!pbdrFilenameMap.has(pid)) pbdrFilenameMap.set(pid, row.original_filename as string);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      {justDeleted && <DeletedBanner />}
      {justRestored && <RestoredBanner />}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">My report requests</h1>
        <Link
          href="/portal/submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          New report request
        </Link>
      </div>

      {/* Credit balance — shown only for credit_deduction orgs */}
      {org?.payment_method === "credit_deduction" && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-5 py-4">
          <div>
            <p className="text-sm font-medium text-zinc-900">Credit balance</p>
            <p className="mt-0.5 text-xs text-zinc-500">Tokens available for report requests</p>
          </div>
          <div className="text-right">
            <p
              className={`text-2xl font-semibold tabular-nums ${
                org.credit_balance === 0 ? "text-red-600" : "text-zinc-900"
              }`}
            >
              {org.credit_balance.toLocaleString()}
            </p>
            {org.credit_balance === 0 && (
              <p className="mt-0.5 text-xs text-red-500">
                No credits remaining — contact your account manager
              </p>
            )}
          </div>
        </div>
      )}

      {/* Approval tray */}
      {pendingApprovals.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            Awaiting your acknowledgement ({pendingApprovals.length})
          </h2>
          <p className="mt-0.5 text-xs text-amber-700">
            Please review and acknowledge the following reports before they can be finalised.
          </p>
          <ul className="mt-3 space-y-2">
            {pendingApprovals.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-md border border-amber-100 bg-white px-4 py-2.5"
              >
                <span className="text-sm text-zinc-900">{projectLabel(p)}</span>
                <PendingReviewModal
                  projectLabel={projectLabel(p)}
                  reviewId={pendingReviewMap.get(p.id)!.id}
                  projectId={p.id}
                  pbdbDownloadUrl={`/api/download/pbdb-client/${p.id}`}
                  pbdbFilename={pbdbFilenameMap.get(p.id)}
                  expiresAt={pendingReviewMap.get(p.id)!.expires_at}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PBDR delivered — available to download */}
      {deliveredProjects.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-5">
          <h2 className="text-sm font-semibold text-green-900">
            {deliveredProjects.length === 1 ? "Your PBDR is ready" : "PBDRs ready to download"} (
            {deliveredProjects.length})
          </h2>
          <p className="mt-0.5 text-xs text-green-700">
            Your Performance-Based Design Report{deliveredProjects.length > 1 ? "s have" : " has"}{" "}
            been delivered. Download below.
          </p>
          <ul className="mt-3 space-y-2">
            {deliveredProjects.map((p) => (
              <DownloadCard
                key={p.id}
                href={`/api/download/pbdr/${p.id}`}
                filename={pbdrFilenameMap.get(p.id)}
                originalFilename={pbdrFilenameMap.get(p.id)}
                buttonLabel="Download PBDR"
                buttonClassName="shrink-0 inline-flex items-center rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                wrapperClassName="flex items-center justify-between gap-3 rounded-md border border-green-100 bg-white px-4 py-2.5"
              >
                <span className="min-w-0 truncate text-sm font-medium text-zinc-900">
                  {projectLabel(p)}
                </span>
              </DownloadCard>
            ))}
          </ul>
        </div>
      )}

      {/* Reports ready to download */}
      {reportsReady.length > 0 && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-5">
          <h2 className="text-sm font-semibold text-green-900">
            {reportsReady.length === 1 ? "Report" : "Reports"} ready to download (
            {reportsReady.length})
          </h2>
          <p className="mt-0.5 text-xs text-green-700">
            {reportsReady.length === 1 ? "Your report is" : "Your reports are"} complete. Download{" "}
            {reportsReady.length === 1 ? "it" : "them"} below —{" "}
            {reportsReady.length === 1 ? "it moves" : "they move"} to History once downloaded or
            after {READY_WINDOW_DAYS} working days.
          </p>
          <ul className="mt-3 space-y-2">
            {reportsReady.map((p) => {
              const from = p.delivered_at ?? p.created_at;
              const daysElapsed = workingDaysElapsed(from, todayIso);
              const daysLeft = READY_WINDOW_DAYS - daysElapsed;
              return (
                <DownloadCard
                  key={p.id}
                  href={`/api/download/pbdr/${p.id}`}
                  filename={pbdrFilenameMap.get(p.id)}
                  originalFilename={pbdrFilenameMap.get(p.id)}
                  buttonLabel="Download report"
                  buttonClassName="shrink-0 inline-flex items-center rounded-md border border-green-200 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                  wrapperClassName="flex items-center justify-between rounded-md border border-green-100 bg-white px-4 py-2.5"
                >
                  <span className="block truncate text-sm font-medium text-zinc-900">
                    {projectLabel(p)}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {daysLeft <= 1
                      ? "Last day to download"
                      : `Available for ${daysLeft} more working day${daysLeft !== 1 ? "s" : ""}`}
                  </span>
                </DownloadCard>
              );
            })}
          </ul>
        </div>
      )}

      {/* Project table */}
      {activeProjects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-zinc-900">No active report requests</p>
          <p className="mt-1 text-sm text-zinc-500">
            Submit a new request or check{" "}
            <Link href="/portal/history" className="underline underline-offset-2">
              History
            </Link>{" "}
            for past reports.
          </p>
          <Link
            href="/portal/submit"
            className="mt-4 inline-block rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            New report request
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {activeProjects.map((p) => (
            <ProjectCard
              key={p.id}
              href={`/portal/projects/${p.id}`}
              label={projectLabel(p)}
              statusLabel={STATUS_LABELS[p.status]}
              statusClassName={STATUS_CLASSES[p.status]}
              stepper={stepperMap.get(p.id) ?? null}
              submittedLabel={formatAuDate(p.created_at)}
              expectedDeliveryLabel={
                p.expected_delivery_date ? formatAuDate(p.expected_delivery_date) : null
              }
              isDelivered={p.status === "delivered"}
              projectId={p.id}
              pbdrFilename={pbdrFilenameMap.get(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
