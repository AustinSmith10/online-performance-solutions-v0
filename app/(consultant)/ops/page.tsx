import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import { RevisionRequiredPanel, type ReviewRow } from "./_components/RevisionRequiredPanel";
import { RealtimeProjectRefresher } from "./_components/RealtimeProjectRefresher";
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
  organisations: { name: string } | null;
  submitter: { first_name: string | null; last_name: string | null; email: string } | null;
};

function clientName(s: ProjectRow["submitter"]) {
  if (!s) return null;
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || s.email;
}

export default async function ConsultantOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const isArchive = tab === "archive";

  const user = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select(`
      id, project_number, extracted_fields, status, po_number, expected_delivery_date, created_at, review_cycle,
      organisations(name),
      submitter:users!projects_submitted_by_fkey(first_name, last_name, email)
    `)
    .eq("assigned_consultant_id", user.id)
    .not("status", "eq", "draft")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const projects = (data ?? []) as unknown as ProjectRow[];
  const todayIso = new Date().toISOString().slice(0, 10);

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
        .select("id, project_id, original_filename, version")
        .in("project_id", revisionIds)
        .eq("file_type", "pbdb")
        .order("version", { ascending: false }),
    ]);

    for (const r of (rawRevisionReviews ?? []) as ReviewRow[]) {
      if (!reviewsByProject[r.project_id]) reviewsByProject[r.project_id] = [];
      reviewsByProject[r.project_id].push(r);
    }

    // Keep only the highest-version PBDB per project (first row after DESC ordering)
    for (const f of (rawPbdbFiles ?? []) as { id: string; project_id: string; original_filename: string | null; version: number }[]) {
      if (!pbdbFileByProject[f.project_id]) {
        pbdbFileByProject[f.project_id] = { id: f.id, original_filename: f.original_filename, version: f.version };
      }
    }
  }
  const active = projects.filter((p) =>
    (["assigned", "in_progress"] as ProjectStatus[]).includes(p.status)
  );
  const withStakeholders = projects.filter((p) =>
    (["dispatched", "converting"] as ProjectStatus[]).includes(p.status)
  );
  const done = projects.filter((p) =>
    (["delivered", "complete"] as ProjectStatus[]).includes(p.status)
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <RealtimeProjectRefresher userId={user.id as string} />
      {/* Header + tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-zinc-900">My projects</h1>
        <div className="flex gap-1 rounded-lg border border-zinc-200 bg-white p-1">
          <Link
            href="/ops"
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              !isArchive
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:text-zinc-900"
            }`}
          >
            Workspace
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

      {/* Workspace tab */}
      {!isArchive && (
        <>
          {projects.filter((p) => !TERMINAL_STATUSES.has(p.status)).length === 0 && (
            <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
              <p className="text-sm font-medium text-zinc-900">No active projects</p>
              <p className="mt-1 text-sm text-zinc-500">
                Projects will appear here once assigned by your account manager.
              </p>
            </div>
          )}

          <RevisionRequiredPanel projects={revisionRequired} reviewsByProject={reviewsByProject} pbdbFileByProject={pbdbFileByProject} />

          <ProjectSection title="Active" projects={active} todayIso={todayIso} />
          <ProjectSection
            title="With stakeholders"
            projects={withStakeholders}
            todayIso={todayIso}
          />
        </>
      )}

      {/* Archive tab */}
      {isArchive && (
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

function ProjectSection({
  title,
  projects,
  todayIso,
}: {
  title: string;
  projects: ProjectRow[];
  todayIso: string;
}) {
  if (projects.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {title}
      </h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="border-b border-zinc-100 bg-zinc-50">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Project</th>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Organisation</th>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Client</th>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Expected delivery</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-50">
            {projects.map((p) => {
              const isOverdue =
                !!p.expected_delivery_date &&
                p.expected_delivery_date < todayIso &&
                !TERMINAL_STATUSES.has(p.status);
              return (
                <ClickableRow key={p.id} href={`/ops/projects/${p.id}`}>
                  <td className="max-w-[180px] truncate px-5 py-3 font-medium text-zinc-900">
                    {(() => {
                        const addr = p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined ?? null;
                        if (p.project_number && addr) return `${p.project_number} — ${addr}`;
                        return addr ?? (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
                      })()}
                  </td>
                  <td className="max-w-[160px] truncate px-5 py-3 text-zinc-600">
                    {p.organisations?.name ?? <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="max-w-[160px] truncate px-5 py-3 text-zinc-600">
                    {clientName(p.submitter) ?? <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[p.status]}`}
                    >
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                    {p.expected_delivery_date ? (
                      <span className={isOverdue ? "font-medium text-red-600" : ""}>
                        {new Date(p.expected_delivery_date).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {isOverdue && (
                          <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            Overdue
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-zinc-300">—</span>
                    )}
                  </td>
                </ClickableRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
