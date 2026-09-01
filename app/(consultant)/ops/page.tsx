import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReviewRow } from "./_components/RevisionReviewDrawer";
import { RealtimeSubscriptionRefresher } from "@/components/RealtimeSubscriptionRefresher";
import { DeclinedBanner } from "./_components/DeclinedBanner";
import { OnboardingFlow } from "./_components/OnboardingFlow";
import { Dashboard } from "./_components/Dashboard";
import type { DashboardData, DashboardProject } from "./_components/dashboardTypes";
import { resolveEffectiveStatus } from "@/lib/delivery/effective-status";
import type { ProjectStatus } from "@/types";

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

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

type ProjectRow = {
  id: string;
  project_number: string | null;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  po_number: string | null;
  expected_delivery_date: string | null;
  created_at: string;
  review_cycle: number;
  accepted_at: string | null;
  paused_previous_status: ProjectStatus | null;
  clients: { name: string; revision_notes_required: boolean } | null;
  submitter: { first_name: string | null; last_name: string | null; email: string } | null;
};

function clientName(s: ProjectRow["submitter"]) {
  if (!s) return null;
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || s.email;
}

type AvailableProject = {
  id: string;
  extracted_fields: Record<string, string> | null;
  po_number: string | null;
  created_at: string;
  expected_delivery_date: string | null;
  clients: { name: string } | null;
};

export default async function ConsultantOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ declined?: string; tour?: string }>;
}) {
  const { declined, tour } = await searchParams;

  const user = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("projects")
    .select(`
      id, project_number, extracted_fields, status, po_number, expected_delivery_date, created_at, review_cycle, accepted_at, paused_previous_status,
      clients(name, revision_notes_required),
      submitter:users!projects_submitted_by_fkey(first_name, last_name, email)
    `)
    .eq("assigned_consultant_id", user.id)
    .not("status", "eq", "draft")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) console.error("[ops] project list query failed:", error);
  const allAssigned = (data ?? []) as unknown as ProjectRow[];
  const todayIso = new Date().toISOString().slice(0, 10);

  // Admin-pushed assignments awaiting this consultant's response (oldest first).
  // These surface as highlighted amber cards at the top of the Active list below,
  // each with inline Accept / Decline — not a separate "Needs your response" tray (#95).
  const pendingAssignments = allAssigned
    .filter((p) => !p.accepted_at)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const projects = allAssigned.filter((p) => p.accepted_at);

  const revisionRequired = projects.filter((p) => p.status === "revision_required");

  // Fetch stakeholder reviews and dispatched PBDB files for all revision-required projects
  const reviewsByProject: Record<string, ReviewRow[]> = {};
  const pbdbFileByProject: Record<
    string,
    { id: string; original_filename: string | null; version: number; created_at: string }
  > = {};
  if (revisionRequired.length > 0) {
    const revisionIds = revisionRequired.map((p) => p.id);

    const [{ data: rawRevisionReviews }, { data: rawPbdbFiles }] = await Promise.all([
      supabase
        .from("stakeholder_reviews")
        .select("id, project_id, stakeholder_name, stakeholder_email, status, comments, responded_at, review_cycle")
        .in("project_id", revisionIds)
        .order("review_cycle", { ascending: false })
        .order("responded_at", { ascending: true }),
      supabase
        .from("project_files")
        .select("id, project_id, original_filename, version, review_cycle, created_at")
        .in("project_id", revisionIds)
        .eq("file_type", "pbdb")
        .order("version", { ascending: false }),
    ]);

    for (const r of (rawRevisionReviews ?? []) as ReviewRow[]) {
      if (!reviewsByProject[r.project_id]) reviewsByProject[r.project_id] = [];
      reviewsByProject[r.project_id].push(r);
    }

    // Serve the docx matching each project's current review cycle — the one that
    // was just rejected — not just whichever version happens to sort highest.
    const cycleByProject = new Map(revisionRequired.map((p) => [p.id, p.review_cycle]));
    for (const f of (rawPbdbFiles ?? []) as { id: string; project_id: string; original_filename: string | null; version: number; review_cycle: number; created_at: string }[]) {
      if (pbdbFileByProject[f.project_id]) continue;
      if (f.review_cycle !== cycleByProject.get(f.project_id)) continue;
      pbdbFileByProject[f.project_id] = { id: f.id, original_filename: f.original_filename, version: f.version, created_at: f.created_at };
    }
  }
  // Single source of truth for "what stage is this project really at" — every
  // list, tab bucket, and label below derives from this instead of separately
  // recomputing "are all reviews resolved," which is what let this landing
  // page disagree with the project detail page about a fully-approved
  // project still being "dispatched" in the DB until an admin/consultant
  // explicitly clicks Convert (conversion no longer auto-fires on full
  // approval).
  const dispatchedIds = projects.filter((p) => p.status === "dispatched").map((p) => p.id);
  const reviewsByProjectId = new Map<string, { status: string }[]>();
  if (dispatchedIds.length > 0) {
    const { data: reviewRows } = await supabase
      .from("stakeholder_reviews")
      .select("project_id, review_cycle, status")
      .in("project_id", dispatchedIds);
    const reviewCycleById = new Map(projects.map((p) => [p.id, p.review_cycle]));
    for (const pid of dispatchedIds) {
      const cycle = reviewCycleById.get(pid);
      reviewsByProjectId.set(
        pid,
        (reviewRows ?? []).filter((r) => r.project_id === pid && r.review_cycle === cycle)
      );
    }
  }
  const effectiveStatusMap = new Map<string, ProjectStatus>(
    projects.map((p) => [p.id, resolveEffectiveStatus(p.status, reviewsByProjectId.get(p.id) ?? [])])
  );
  const effectiveStatusOf = (p: ProjectRow) => effectiveStatusMap.get(p.id) ?? p.status;

  // A paused project must still land in a tab — it should never just vanish
  // from the consultant's workspace. Bucket it by where it was paused *from*
  // (paused_previous_status) while its badge/label still reads "Paused" via
  // effectiveStatusOf above, which leaves "paused" untouched.
  const bucketStatusOf = (p: ProjectRow): ProjectStatus =>
    p.status === "paused" ? p.paused_previous_status ?? "assigned" : effectiveStatusOf(p);

  // One consistent "actionable = highlighted card" list, no separate tray (#95):
  // admin-pushed assignments awaiting acceptance float to the very top (a decision
  // is owed), then revision-required cards, then the rest of the active work.
  // "Converting" (real or effective) lives here too, not under "With
  // stakeholders" — nothing is actually waiting on a stakeholder anymore.
  const activeAccepted = projects
    .filter((p) =>
      (["assigned", "in_progress", "revision_required", "converting"] as ProjectStatus[]).includes(
        bucketStatusOf(p)
      )
    )
    .sort((a, b) => Number(bucketStatusOf(b) === "revision_required") - Number(bucketStatusOf(a) === "revision_required"));
  const withStakeholders = projects.filter((p) => bucketStatusOf(p) === "dispatched");
  const done = projects.filter((p) =>
    (["delivered", "complete"] as ProjectStatus[]).includes(p.status)
  );

  // Available jobs — submitted, unassigned, not deleted
  const { data: rawAvailable } = await supabase
    .from("projects")
    .select("id, extracted_fields, po_number, created_at, expected_delivery_date, clients(name)")
    .eq("status", "submitted")
    .is("assigned_consultant_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  const availableProjects = (rawAvailable ?? []) as unknown as AvailableProject[];

  // #115: a single aggregated query for "which of this consultant's projects
  // has at least one stakeholder-confirmed verification mismatch" — not N+1
  // lookups per row.
  const { data: mismatchRows } = allAssigned.length
    ? await supabase
        .from("project_files")
        .select("project_id")
        .in("project_id", allAssigned.map((p) => p.id))
        .not("verification_mismatch_reasons", "is", null)
        .not("verification_confirmed_at", "is", null)
    : { data: [] };
  const mismatchProjectIds = new Set((mismatchRows ?? []).map((r) => r.project_id as string));

  function toDashboardProject(p: ProjectRow): DashboardProject {
    const isOverdue =
      !!p.expected_delivery_date && p.expected_delivery_date < todayIso && !TERMINAL_STATUSES.has(p.status);
    const isPending = !p.accepted_at;
    const isRevision = p.status === "revision_required";
    const effectiveStatus = effectiveStatusOf(p);
    return {
      id: p.id,
      href: `/ops/projects/${p.id}`,
      label: projectLabel(p),
      clientName: p.clients?.name ?? null,
      submitterName: clientName(p.submitter),
      statusLabel: STATUS_LABELS[effectiveStatus],
      statusClassName: STATUS_CLASSES[effectiveStatus],
      expectedDeliveryLabel: p.expected_delivery_date ? formatAuDate(p.expected_delivery_date) : null,
      submittedLabel: formatAuDate(p.created_at),
      isOverdue,
      isPending,
      isRevision,
      hasVerificationMismatch: mismatchProjectIds.has(p.id),
      pendingAssignment: isPending ? { projectId: p.id } : undefined,
      revisionReview:
        isRevision && !isPending
          ? {
              project: p,
              reviews: reviewsByProject[p.id] ?? [],
              pbdbFile: pbdbFileByProject[p.id] ?? null,
            }
          : undefined,
    };
  }

  const dashboardData: DashboardData = {
    pendingAssignments: pendingAssignments.map(toDashboardProject),
    active: activeAccepted.map(toDashboardProject),
    withStakeholders: withStakeholders.map(toDashboardProject),
    archive: done.map(toDashboardProject),
    available: availableProjects.map((p) => {
      const addr = p.extracted_fields?.["EXTRACT_ADDRESS"] ?? null;
      const label = addr ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
      return {
        id: p.id,
        label,
        clientName: p.clients?.name ?? null,
        submittedLabel: formatAuDate(p.created_at),
        expectedDeliveryLabel: p.expected_delivery_date ? formatAuDate(p.expected_delivery_date) : null,
      };
    }),
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <RealtimeSubscriptionRefresher
        channelName={`consultant-workspace-${user.id}`}
        subscriptions={[
          // This consultant's own assigned projects — status changes, new assignments, etc.
          { table: "projects", filter: `assigned_consultant_id=eq.${user.id}` },
          { table: "notifications", filter: `recipient_id=eq.${user.id}`, event: "INSERT" },
          // Available/unassigned jobs list below is scoped to status=submitted, and a
          // project entering or leaving that status is exactly what should refresh it —
          // postgres_changes filters don't support the compound "and assigned_consultant_id
          // is null" the list itself uses, so this errs broad rather than missing events.
          { table: "projects", filter: "status=eq.submitted" },
          // Stakeholder review responses — not scoped to this consultant's projects since
          // postgres_changes filters can't join through projects.assigned_consultant_id.
          { table: "stakeholder_reviews" },
        ]}
      />
      <OnboardingFlow
        seenConsultantTour={(user.onboarding_steps_seen ?? []).includes("consultant_tour")}
        seenSteps={user.onboarding_steps_seen ?? []}
        replay={tour === "replay"}
      >
        {declined === "1" && <DeclinedBanner />}
        <Dashboard data={dashboardData} />
      </OnboardingFlow>
    </div>
  );
}

function formatAuDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function projectLabel(p: Pick<ProjectRow, "project_number" | "extracted_fields" | "po_number" | "id">) {
  const addr = (p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined)?.trim() || null;
  if (p.project_number && addr) return `${p.project_number} — ${addr}`;
  return addr ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
}
