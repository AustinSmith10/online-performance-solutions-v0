import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
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
};

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

type ProjectRow = {
  id: string;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  po_number: string | null;
  expected_delivery_date: string | null;
  created_at: string;
};

export default async function ConsultantOpsPage() {
  const user = await requireRole("consultant", "super_admin");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select("id, extracted_fields, status, po_number, expected_delivery_date, created_at")
    .eq("assigned_consultant_id", user.id)
    .not("status", "eq", "draft")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const projects = (data ?? []) as ProjectRow[];
  const todayIso = new Date().toISOString().slice(0, 10);

  const active = projects.filter((p) =>
    (["assigned", "in_progress", "revision_required"] as ProjectStatus[]).includes(p.status)
  );
  const withStakeholders = projects.filter((p) =>
    (["dispatched", "converting"] as ProjectStatus[]).includes(p.status)
  );
  const done = projects.filter((p) =>
    (["delivered", "complete"] as ProjectStatus[]).includes(p.status)
  );

  const hasAny = projects.length > 0;

  return (
    <div className="space-y-10">
      <h1 className="text-xl font-semibold text-zinc-900">My projects</h1>

      {!hasAny && (
        <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center">
          <p className="text-sm font-medium text-zinc-900">No projects assigned yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Projects will appear here once assigned by your account manager.
          </p>
        </div>
      )}

      <ProjectSection title="Active" projects={active} todayIso={todayIso} />
      <ProjectSection title="With stakeholders" projects={withStakeholders} todayIso={todayIso} />
      <ProjectSection title="Completed" projects={done} todayIso={todayIso} />
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
        {title} ({projects.length})
      </h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="border-b border-zinc-100">
            <tr>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">Address</th>
              <th className="px-5 py-3 text-left font-medium text-zinc-500">PO number</th>
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
                  <td className="px-5 py-3 font-medium text-zinc-900">
                    {(p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) || (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8))}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">
                    {p.po_number ?? <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[p.status]}`}
                    >
                      {STATUS_LABELS[p.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-zinc-500">
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
