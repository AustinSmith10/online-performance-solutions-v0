import Link from "next/link";
import { Suspense } from "react";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ConsultantProjectCard } from "./_components/ConsultantProjectCard";
import type { ReviewRow, PbdbFile } from "./_components/RevisionReviewDrawer";
import { RealtimeProjectRefresher } from "./_components/RealtimeProjectRefresher";
import { SelfAssignButton } from "./_components/SelfAssignButton";
import { DeclinedBanner } from "./_components/DeclinedBanner";
import { TourInviteCard } from "./_components/TourInviteCard";
import { ConsultantTour } from "@/components/onboarding-tour/ConsultantTour";
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
  clients: { name: string } | null;
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
  searchParams: Promise<{ tab?: string; declined?: string }>;
}) {
  const { tab, declined } = await searchParams;
  const isArchive = tab === "archive";
  const isAvailable = tab === "available";

  const user = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("projects")
    .select(`
      id, project_number, extracted_fields, status, po_number, expected_delivery_date, created_at, review_cycle, accepted_at,
      clients(name),
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
  const active = [...pendingAssignments, ...activeAccepted];
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

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <RealtimeProjectRefresher userId={user.id as string} />
      <Suspense fallback={null}>
        <ConsultantTour />
      </Suspense>
      {!(user.onboarding_steps_seen ?? []).includes("consultant_tour") && <TourInviteCard />}
      {declined === "1" && <DeclinedBanner />}
      {/* Header + tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-zinc-900">My projects</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/ops/projects/submit"
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            Submit request
          </Link>
          <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1">
            <Link
              href="/ops"
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                !isArchive && !isAvailable
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Workspace
            </Link>
            <Link
              href="/ops?tab=available"
              className={`relative rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                isAvailable
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Available jobs
              {availableProjects.length > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                  isAvailable ? "bg-white text-zinc-900" : "bg-blue-600 text-white"
                }`}>
                  {availableProjects.length}
                </span>
              )}
            </Link>
            <Link
              href="/ops?tab=archive"
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                isArchive
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              Archive
            </Link>
          </div>
        </div>
      </div>

      {/* Available jobs tab */}
      {isAvailable && (
        availableProjects.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
            <p className="text-sm font-medium text-zinc-900">No available jobs</p>
            <p className="mt-1 text-sm text-zinc-500">
              New submissions will appear here once a client submits a report request.
            </p>
          </div>
        ) : (
          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Available jobs ({availableProjects.length})
            </h2>
            <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-zinc-100 bg-zinc-50">
                  <tr>
                    <th className="px-5 py-3 text-left font-medium text-zinc-500">Project</th>
                    <th className="px-5 py-3 text-left font-medium text-zinc-500">Client</th>
                    <th className="px-5 py-3 text-left font-medium text-zinc-500">Submitted</th>
                    <th className="px-5 py-3 text-left font-medium text-zinc-500">Expected delivery</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {availableProjects.map((p) => {
                    const addr = p.extracted_fields?.["EXTRACT_ADDRESS"] ?? null;
                    const label = addr ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
                    return (
                      <tr key={p.id} className="hover:bg-zinc-50">
                        <td className="max-w-[200px] truncate px-5 py-3 font-medium text-zinc-900">
                          {label}
                        </td>
                        <td className="max-w-[160px] truncate px-5 py-3 text-zinc-600">
                          {p.clients?.name ?? <span className="text-zinc-400">—</span>}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                          {new Date(p.created_at).toLocaleDateString("en-AU", {
                            day: "numeric", month: "short", year: "numeric",
                          })}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                          {p.expected_delivery_date
                            ? new Date(p.expected_delivery_date).toLocaleDateString("en-AU", {
                                day: "numeric", month: "short", year: "numeric",
                              })
                            : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-5 py-3 text-right">
                          <SelfAssignButton projectId={p.id} address={label} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      )}

      {/* Workspace tab */}
      {!isArchive && !isAvailable && (
        <>
          {active.length === 0 && withStakeholders.length === 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
              <p className="text-sm font-medium text-zinc-900">No active projects</p>
              <p className="mt-1 text-sm text-zinc-500">
                Projects will appear here once assigned by your account manager.
              </p>
            </div>
          )}

          <ProjectSection
            title="Active"
            projects={active}
            todayIso={todayIso}
            reviewsByProject={reviewsByProject}
            pbdbFileByProject={pbdbFileByProject}
          />
          <ProjectSection
            title="With stakeholders"
            projects={withStakeholders}
            todayIso={todayIso}
          />
        </>
      )}

      {/* Archive tab */}
      {isArchive && !isAvailable && (
        done.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
            <p className="text-sm font-medium text-zinc-900">No archived projects</p>
            <p className="mt-1 text-sm text-zinc-500">
              Delivered and completed projects will appear here.
            </p>
          </div>
        ) : (
          <ProjectSection title={`Archive (${done.length})`} projects={done} todayIso={todayIso} />
        )
      )}
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

function ProjectSection({
  title,
  projects,
  todayIso,
  reviewsByProject,
  pbdbFileByProject,
}: {
  title: string;
  projects: ProjectRow[];
  todayIso: string;
  reviewsByProject?: Record<string, ReviewRow[]>;
  pbdbFileByProject?: Record<string, PbdbFile>;
}) {
  if (projects.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h2>
      <div className="flex flex-col gap-3">
        {projects.map((p) => {
          const isOverdue =
            !!p.expected_delivery_date &&
            p.expected_delivery_date < todayIso &&
            !TERMINAL_STATUSES.has(p.status);
          const isPending = !p.accepted_at;
          const isRevision = p.status === "revision_required";
          return (
            <ConsultantProjectCard
              key={p.id}
              href={`/ops/projects/${p.id}`}
              label={projectLabel(p)}
              clientName={p.clients?.name ?? null}
              submitterName={clientName(p.submitter)}
              statusLabel={STATUS_LABELS[p.status]}
              statusClassName={STATUS_CLASSES[p.status]}
              expectedDeliveryLabel={p.expected_delivery_date ? formatAuDate(p.expected_delivery_date) : null}
              isOverdue={isOverdue}
              pendingAssignment={isPending ? { projectId: p.id } : undefined}
              revisionReview={
                isRevision && !isPending
                  ? {
                      project: p,
                      reviews: reviewsByProject?.[p.id] ?? [],
                      pbdbFile: pbdbFileByProject?.[p.id] ?? null,
                    }
                  : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );
}
