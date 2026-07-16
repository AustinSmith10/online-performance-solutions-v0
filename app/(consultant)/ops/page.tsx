import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReviewRow } from "./_components/RevisionReviewDrawer";
import { RealtimeProjectRefresher } from "./_components/RealtimeProjectRefresher";
import { DeclinedBanner } from "./_components/DeclinedBanner";
import { TourInviteCard } from "./_components/TourInviteCard";
import { ConsultantTour } from "@/components/onboarding-tour/ConsultantTour";
import { Dashboard } from "./_components/Dashboard";
import type { DashboardData, DashboardProject } from "./_components/dashboardTypes";
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
  searchParams: Promise<{ declined?: string }>;
}) {
  const { declined } = await searchParams;

  const user = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("projects")
    .select(`
      id, project_number, extracted_fields, status, po_number, expected_delivery_date, created_at, review_cycle, accepted_at,
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
  const pbdbFileByProject: Record<string, { id: string; original_filename: string | null; version: number }> = {};
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
        .select("id, project_id, original_filename, version, review_cycle")
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
    for (const f of (rawPbdbFiles ?? []) as { id: string; project_id: string; original_filename: string | null; version: number; review_cycle: number }[]) {
      if (pbdbFileByProject[f.project_id]) continue;
      if (f.review_cycle !== cycleByProject.get(f.project_id)) continue;
      pbdbFileByProject[f.project_id] = { id: f.id, original_filename: f.original_filename, version: f.version };
    }
  }
  // One consistent "actionable = highlighted card" list, no separate tray (#95):
  // admin-pushed assignments awaiting acceptance float to the very top (a decision
  // is owed), then revision-required cards, then the rest of the active work.
  const activeAccepted = projects
    .filter((p) => (["assigned", "in_progress", "revision_required"] as ProjectStatus[]).includes(p.status))
    .sort((a, b) => Number(b.status === "revision_required") - Number(a.status === "revision_required"));
  const withStakeholders = projects.filter((p) =>
    (["dispatched", "converting"] as ProjectStatus[]).includes(p.status)
  );
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

  function toDashboardProject(p: ProjectRow): DashboardProject {
    const isOverdue =
      !!p.expected_delivery_date && p.expected_delivery_date < todayIso && !TERMINAL_STATUSES.has(p.status);
    const isPending = !p.accepted_at;
    const isRevision = p.status === "revision_required";
    return {
      id: p.id,
      href: `/ops/projects/${p.id}`,
      label: projectLabel(p),
      clientName: p.clients?.name ?? null,
      submitterName: clientName(p.submitter),
      statusLabel: STATUS_LABELS[p.status],
      statusClassName: STATUS_CLASSES[p.status],
      expectedDeliveryLabel: p.expected_delivery_date ? formatAuDate(p.expected_delivery_date) : null,
      submittedLabel: formatAuDate(p.created_at),
      isOverdue,
      isPending,
      isRevision,
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
      <RealtimeProjectRefresher userId={user.id as string} />
      <Suspense fallback={null}>
        <ConsultantTour />
      </Suspense>
      {!(user.onboarding_steps_seen ?? []).includes("consultant_tour") && <TourInviteCard />}
      {declined === "1" && <DeclinedBanner />}
      <Dashboard data={dashboardData} />
    </div>
  );
}

function formatAuDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function projectLabel(p: Pick<ProjectRow, "project_number" | "extracted_fields" | "po_number" | "id">) {
  const addr = (p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ?? null;
  if (p.project_number && addr) return `${p.project_number} — ${addr}`;
  return addr ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
}
