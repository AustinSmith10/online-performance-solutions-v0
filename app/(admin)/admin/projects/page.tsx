import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { ProjectStatus } from "@/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assigned: "Assigned",
  in_review: "In review",
  qa: "QA",
  approved: "Approved",
  dispatched: "Dispatched",
  delivered: "Delivered",
  complete: "Complete",
};

const STATUS_CLASSES: Record<ProjectStatus, string> = {
  draft: "bg-zinc-100 text-zinc-500",
  submitted: "bg-blue-100 text-blue-700",
  assigned: "bg-yellow-100 text-yellow-700",
  in_review: "bg-purple-100 text-purple-700",
  qa: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  dispatched: "bg-green-100 text-green-700",
  delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500",
};

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

export default async function ProjectsPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("projects")
    .select(`
      id,
      extracted_fields,
      status,
      expected_delivery_date,
      created_at,
      organisations(name),
      consultant:users!projects_assigned_consultant_id_fkey(first_name, last_name, email)
    `)
    .order("created_at", { ascending: false });

  type ProjectRow = {
    id: string;
    extracted_fields: Record<string, string> | null;
    status: ProjectStatus;
    expected_delivery_date: string | null;
    created_at: string;
    organisations: { name: string } | null;
    consultant: { first_name: string | null; last_name: string | null; email: string } | null;
  };

  const projects = (data ?? []) as unknown as ProjectRow[];
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Projects</h1>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No projects yet. They will appear here once clients submit via the portal.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Address</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Organisation</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Consultant</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {projects.map((p) => (
                <ClickableRow key={p.id} href={`/admin/projects/${p.id}`}>
                  <td className="px-5 py-3 font-medium text-zinc-900">
                    {p.extracted_fields?.CLIENT_ADDRESS ?? p.id.slice(0, 8)}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">
                    {p.organisations?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">
                    {p.consultant
                      ? [p.consultant.first_name, p.consultant.last_name].filter(Boolean).join(" ") || p.consultant.email
                      : <span className="text-zinc-400">Unassigned</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                    {p.expected_delivery_date &&
                      p.expected_delivery_date < todayIso &&
                      !TERMINAL_STATUSES.has(p.status) && (
                        <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          Overdue
                        </span>
                      )}
                  </td>
                  <td className="px-5 py-3 text-zinc-500">
                    {new Date(p.created_at).toLocaleDateString("en-AU")}
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
