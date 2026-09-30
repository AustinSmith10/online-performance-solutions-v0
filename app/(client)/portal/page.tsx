import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStakeholderReviewedProjectIds, stakeholderAccessFilter } from "@/lib/portal/access";
import { DeletedBanner } from "./_components/DeletedBanner";
import { RestoredBanner } from "./_components/RestoredBanner";
import { PortalDashboard } from "./_components/PortalDashboard";
import { OnboardingTourProvider } from "@/components/onboarding-tour/context";
import { STAKEHOLDER_TOUR_STEPS } from "@/lib/onboarding/steps";
import { resolveStepperState, type StepperResult } from "@/lib/delivery/stepper";
import { resolveEffectiveStatus, OUTSTANDING_STATUSES } from "@/lib/delivery/effective-status";
import type { ProjectStatus, PaymentMethod } from "@/types";
import type { DashboardData } from "./_components/dashboardTypes";
import { dispatchPdfFilenameFor } from "@/lib/documents/naming";

// Kept in sync with stepperBadge()'s SHORT_BADGE_LABELS (components/delivery/StepperVisuals.tsx)
// so the Filters panel's status list matches the wording actually shown on each row's pill —
// they used to diverge (e.g. "Awaiting Approval" here vs "Awaiting review" on the pill).
const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assigned: "In progress",
  in_progress: "In progress",
  dispatched: "Awaiting review",
  revision_required: "Revising",
  converting: "Finalizing",
  delivered: "Delivered",
  complete: "Delivered",
  paused: "On hold",
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

function projectLabel(
  p: Pick<ProjectRow, "extracted_fields" | "po_number" | "id" | "created_at">
): string {
  const address = (p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined)?.trim();
  return address || (p.po_number ? `PO ${p.po_number}` : `Draft — started ${formatAuDate(p.created_at)}`);
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

  // A stakeholder may see a project it submitted, or one it's been asked to
  // review — never every project the org has ever submitted.
  // Round trip 1: the review ids that widen this viewer's access, the client
  // row, and their pending reviews are independent of each other. Round trip 2
  // is the project list, which needs the ids.
  const [reviewedProjectIds, { data: orgData }, { data: pendingReviewsData }] = await Promise.all([
    getStakeholderReviewedProjectIds(supabase, user.email as string),
    supabase
      .from("clients")
      .select("payment_method, credit_balance, show_consultant_name")
      .eq("id", orgId)
      .single(),
    supabase
      .from("stakeholder_reviews")
      .select("id, project_id, token, expires_at, review_cycle")
      .eq("stakeholder_email", user.email as string)
      .eq("status", "pending"),
  ]);

  const { data: projectsData } = await supabase
    .from("projects")
    .select(
      "id, po_number, extracted_fields, status, created_at, delivered_at, expected_delivery_date, review_cycle, paused_previous_status, pbdb_downloaded_at, assigned_consultant_id"
    )
    .eq("client_id", orgId)
    .is("deleted_at", null)
    .or(stakeholderAccessFilter(user.id as string, reviewedProjectIds))
    .order("created_at", { ascending: false });

  const projects = (projectsData ?? []) as unknown as ProjectRow[];
  const org = orgData as OrgRow | null;

  type PendingReview = { id: string; project_id: string; token: string; expires_at: string; review_cycle: number };
  const pendingReviewMap = new Map<string, PendingReview>(
    (pendingReviewsData ?? []).map((r) => [r.project_id as string, r as unknown as PendingReview])
  );
  const pendingApprovals = projects.filter((p) => pendingReviewMap.has(p.id));

  // Complete projects within the 8-working-day window
  const recentlyComplete = projects.filter((p) => {
    if (p.status !== "complete") return false;
    const from = p.delivered_at ?? p.created_at;
    return workingDaysElapsed(from, todayIso) < READY_WINDOW_DAYS;
  });

  // Projects currently in delivered status
  const allDelivered = projects.filter((p) => p.status === "delivered");

  // Main list: exclude complete projects (they live in history or the ready banner).
  // Projects needing stakeholder attention float to the top — pending review first
  // (a decision is owed), then delivered/ready-to-download — with only a handful of
  // active projects at a time, that's more visible than a duplicate banner.
  const activeProjectPriority = (p: (typeof projects)[number]) =>
    pendingReviewMap.has(p.id) ? 2 : p.status === "delivered" ? 1 : 0;
  const activeProjects = projects
    .filter((p) => p.status !== "complete")
    .sort((a, b) => activeProjectPriority(b) - activeProjectPriority(a));

  const consultantIds = [
    ...new Set(activeProjects.map((p) => p.assigned_consultant_id).filter((id): id is string => !!id)),
  ];
  const dispatchedIds = activeProjects.filter((p) => p.status === "dispatched").map((p) => p.id);
  // The PBDR filename lookup covers delivered and recently-complete projects —
  // a superset of the "ready" banner's projects (recently complete and not yet
  // downloaded) — so it doesn't have to wait for the download check.
  const pbdrRelevantIds = [...new Set([...allDelivered, ...recentlyComplete].map((p) => p.id))];

  // Round trip 3: every remaining lookup depends only on the project list.
  const [pbdbFilesResult, dlRowsResult, consultantRowsResult, reviewRowsResult, pbdrFilesResult] = await Promise.all([
    // Latest PBDB filename per project with a pending approval. The stakeholder
    // is served the converted `pbdb_pdf` (not the .docx source), so use that
    // row's name — it's what the download saves as and what the previewer needs
    // to recognise a PDF. Match the pending review's cycle, highest version.
    pendingApprovals.length > 0
      ? supabase
          .from("project_files")
          .select("project_id, file_type, original_filename, version, review_cycle")
          .in("project_id", pendingApprovals.map((p) => p.id))
          .in("file_type", ["pbdb_pdf", "pbdb"])
          .order("version", { ascending: false })
      : Promise.resolve({ data: [] as { project_id: string; file_type: string; original_filename: string; version: number; review_cycle: number }[] }),
    // Which of the recently-complete projects this user has already downloaded
    recentlyComplete.length > 0
      ? supabase
          .from("audit_log")
          .select("project_id")
          .eq("event_type", "project.pbdr_downloaded")
          .eq("actor_id", user.id as string)
          .in("project_id", recentlyComplete.map((p) => p.id))
      : Promise.resolve({ data: [] as { project_id: string }[] }),
    // Consultant first names — for the "assessing"/"working on"/"applying changes" captions
    consultantIds.length > 0
      ? supabase.from("users").select("id, first_name").in("id", consultantIds)
      : Promise.resolve({ data: [] as { id: string; first_name: string | null }[] }),
    dispatchedIds.length > 0
      ? supabase
          .from("stakeholder_reviews")
          .select("project_id, review_cycle, status, stakeholder_email")
          .in("project_id", dispatchedIds)
      : Promise.resolve({ data: [] as { project_id: string; review_cycle: number; status: string; stakeholder_email: string }[] }),
    // Latest PBDR original_filename per project — shown under the download button
    pbdrRelevantIds.length > 0
      ? supabase
          .from("project_files")
          .select("project_id, original_filename, version")
          .in("project_id", pbdrRelevantIds)
          .eq("file_type", "pbdr")
          .order("version", { ascending: false })
      : Promise.resolve({ data: [] as { project_id: string; original_filename: string; version: number }[] }),
  ]);

  const pbdbFilenameMap = new Map<string, string>();
  // Prefer the cached PDF's name; with no cached PDF yet (the routes
  // regenerate it on demand, #186) fall back to the name it will carry.
  const pbdbRows = [...(pbdbFilesResult.data ?? [])].sort(
    (a, b) => Number(a.file_type !== "pbdb_pdf") - Number(b.file_type !== "pbdb_pdf")
  );
  for (const row of pbdbRows) {
    const pid = row.project_id as string;
    if (pbdbFilenameMap.has(pid)) continue;
    const cycle = pendingReviewMap.get(pid)?.review_cycle;
    if (cycle != null && row.review_cycle !== cycle) continue;
    const name = row.original_filename as string;
    pbdbFilenameMap.set(pid, row.file_type === "pbdb_pdf" ? name : dispatchPdfFilenameFor(name));
  }

  const downloadedIds = new Set<string>();
  for (const row of dlRowsResult.data ?? []) downloadedIds.add(row.project_id as string);

  // Ready banner: recently complete + not yet downloaded by this user
  const reportsReady = recentlyComplete.filter((p) => !downloadedIds.has(p.id));

  const consultantNameMap = new Map<string, string | null>();
  for (const row of consultantRowsResult.data ?? []) {
    consultantNameMap.set(row.id as string, row.first_name as string | null);
  }

  // Every surface derives its display status from resolveEffectiveStatus
  // rather than separately recomputing "are all reviews resolved" — that
  // duplication is what let the dashboard, project detail, and stepper
  // disagree about whether a project was still "awaiting approval".
  const reviewsByProjectId = new Map<string, { status: string; stakeholder_email: string }[]>();
  const reviewRows = reviewRowsResult.data ?? [];
  const reviewCycleById = new Map(activeProjects.map((p) => [p.id, p.review_cycle]));
  for (const pid of dispatchedIds) {
    const cycle = reviewCycleById.get(pid);
    reviewsByProjectId.set(
      pid,
      reviewRows.filter((r) => r.project_id === pid && r.review_cycle === cycle)
    );
  }
  const effectiveStatusMap = new Map<string, ProjectStatus>(
    activeProjects.map((p) => [
      p.id,
      resolveEffectiveStatus(p.status, reviewsByProjectId.get(p.id) ?? []),
    ])
  );

  // Once this stakeholder's own review is no longer pending, the "please
  // review" caption gives way to a "waiting on N more stakeholders" one —
  // outstanding count excludes their own (already-resolved) row naturally,
  // since OUTSTANDING_STATUSES only matches rows still needing a response.
  const viewerHasRespondedMap = new Map<string, boolean>();
  const outstandingReviewCountMap = new Map<string, number>();
  for (const pid of dispatchedIds) {
    const rows = reviewsByProjectId.get(pid) ?? [];
    const viewerRow = rows.find((r) => r.stakeholder_email === (user.email as string));
    viewerHasRespondedMap.set(pid, !!viewerRow && !OUTSTANDING_STATUSES.has(viewerRow.status));
    outstandingReviewCountMap.set(pid, rows.filter((r) => OUTSTANDING_STATUSES.has(r.status)).length);
  }

  // Real-status-only stepper state per row — draft has no stepper (stakeholders never see progress pre-submission)
  const stepperMap = new Map<string, StepperResult>();
  for (const p of activeProjects) {
    if (p.status === "draft") continue;
    stepperMap.set(
      p.id,
      resolveStepperState({
        status: effectiveStatusMap.get(p.id) ?? p.status,
        pausedPreviousStatus: p.paused_previous_status,
        reviewCycle: p.review_cycle,
        pbdbDownloadedAt: p.pbdb_downloaded_at,
        showConsultantName: org?.show_consultant_name ?? true,
        consultantFirstName: p.assigned_consultant_id
          ? consultantNameMap.get(p.assigned_consultant_id) ?? null
          : null,
        viewerFirstName: (user.first_name as string | null) ?? null,
        viewerHasResponded: viewerHasRespondedMap.get(p.id) ?? false,
        outstandingReviewCount: outstandingReviewCountMap.get(p.id) ?? 0,
      })
    );
  }

  const pbdrFilenameMap = new Map<string, string>();
  for (const row of pbdrFilesResult.data ?? []) {
    const pid = row.project_id as string;
    if (!pbdrFilenameMap.has(pid)) pbdrFilenameMap.set(pid, row.original_filename as string);
  }

  const dashboardData: DashboardData = {
    rows: activeProjects.map((p) => ({
      id: p.id,
      href: `/portal/projects/${p.id}`,
      label: projectLabel(p),
      statusLabel: STATUS_LABELS[effectiveStatusMap.get(p.id) ?? p.status],
      statusClassName: STATUS_CLASSES[effectiveStatusMap.get(p.id) ?? p.status],
      stepper: stepperMap.get(p.id) ?? null,
      submittedLabel: formatAuDate(p.created_at),
      submittedAt: p.created_at,
      expectedDeliveryLabel: p.expected_delivery_date ? formatAuDate(p.expected_delivery_date) : null,
      expectedDeliveryAt: p.expected_delivery_date,
      isDelivered: p.status === "delivered",
      pbdrFilename: pbdrFilenameMap.get(p.id),
      pendingReview: pendingReviewMap.has(p.id)
        ? {
            reviewId: pendingReviewMap.get(p.id)!.id,
            expiresAt: pendingReviewMap.get(p.id)!.expires_at,
            pbdbDownloadUrl: `/api/download/pbdb-client/${p.id}`,
            pbdbFilename: pbdbFilenameMap.get(p.id),
          }
        : undefined,
    })),
    readyItems: reportsReady.map((p) => {
      const from = p.delivered_at ?? p.created_at;
      const daysElapsed = workingDaysElapsed(from, todayIso);
      return {
        id: p.id,
        label: projectLabel(p),
        href: `/api/download/pbdr/${p.id}`,
        filename: pbdrFilenameMap.get(p.id),
        daysLeft: READY_WINDOW_DAYS - daysElapsed,
      };
    }),
    org: org ? { paymentMethod: org.payment_method, creditBalance: org.credit_balance } : null,
    readyWindowDays: READY_WINDOW_DAYS,
  };
  return (
    <OnboardingTourProvider
      steps={STAKEHOLDER_TOUR_STEPS}
      seenSteps={user.onboarding_steps_seen ?? []}
      availableStepIds={["stakeholder_intro", "stakeholder_action_items", "stakeholder_project_list"]}
      replay={sp.tour === "replay"}
    >
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-8">
        {justDeleted && <DeletedBanner />}
        {justRestored && <RestoredBanner />}
        <PortalDashboard {...dashboardData} />
      </div>
    </OnboardingTourProvider>
  );
}
