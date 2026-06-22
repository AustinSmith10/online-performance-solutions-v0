import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { ProjectStatus } from "@/types";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  assigned: "Assigned",
  in_progress: "In Progress",
  qa_complete: "QA Complete",
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
  qa_complete: "bg-teal-100 text-teal-700",
  dispatched: "bg-amber-100 text-amber-700",
  revision_required: "bg-red-100 text-red-700",
  converting: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500",
};

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

const SORT_COLS = ["created_at", "expected_delivery_date", "status", "org"] as const;
type SortCol = (typeof SORT_COLS)[number];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "created_at") === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/projects?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">↕</span>;
  return <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>;
}

type ProjectRow = {
  id: string;
  po_number: string | null;
  site_address: string | null;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  payment_override: boolean;
  expected_delivery_date: string | null;
  created_at: string;
  organisations: { name: string } | null;
  consultant: { first_name: string | null; last_name: string | null; email: string } | null;
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; org?: string; sort?: string; order?: string }>;
}) {
  const { q, status, org, sort, order } = await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "created_at";
  const sortOrder: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  const params = { q, status, org, sort, order };

  const supabase = createAdminClient();

  // Resolve org name filter to IDs
  let orgIds: string[] | null = null;
  if (org?.trim()) {
    const { data: matched } = await supabase
      .from("organisations")
      .select("id")
      .ilike("name", `%${org.trim()}%`);
    orgIds = matched?.map((o) => o.id as string) ?? [];
  }

  let query = supabase
    .from("projects")
    .select(`
      id,
      po_number,
      site_address,
      extracted_fields,
      status,
      payment_override,
      expected_delivery_date,
      created_at,
      organisations(name),
      consultant:users!projects_assigned_consultant_id_fkey(first_name, last_name, email)
    `)
    .is("deleted_at", null);

  query = sortCol === "org"
    ? query.order("name", { referencedTable: "organisations", ascending: sortOrder === "asc" })
    : query.order(sortCol, { ascending: sortOrder === "asc" });

  if (q?.trim()) {
    query = query.or(
      `site_address.ilike.%${q.trim()}%,po_number.ilike.%${q.trim()}%`
    );
  }
  if (status?.trim()) query = query.eq("status", status.trim());
  if (orgIds !== null) {
    if (orgIds.length === 0) {
      const projects: ProjectRow[] = [];
      const todayIso = new Date().toISOString().slice(0, 10);
      return <ProjectsLayout projects={projects} todayIso={todayIso} params={params} sortCol={sortCol} sortOrder={sortOrder} hasFilter={!!(q || status || org)} />;
    }
    query = query.in("org_id", orgIds);
  }

  const { data } = await query;
  const projects = (data ?? []) as unknown as ProjectRow[];
  const todayIso = new Date().toISOString().slice(0, 10);
  const hasFilter = !!(q || status || org);

  return <ProjectsLayout projects={projects} todayIso={todayIso} params={params} sortCol={sortCol} sortOrder={sortOrder} hasFilter={hasFilter} />;
}

function ProjectsLayout({
  projects,
  todayIso,
  params,
  sortCol,
  sortOrder,
  hasFilter,
}: {
  projects: ProjectRow[];
  todayIso: string;
  params: Record<string, string | undefined>;
  sortCol: SortCol;
  sortOrder: "asc" | "desc";
  hasFilter: boolean;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Projects</h1>
      </div>

      <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search address or PO number…"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            <option value="">All statuses</option>
            {(Object.entries(STATUS_LABELS) as [ProjectStatus, string][]).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <input
            type="text"
            name="org"
            defaultValue={params.org ?? ""}
            placeholder="Organisation…"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/projects"
              className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No projects match your filters." : "No projects yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[600px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Address</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "org")} className="group inline-flex items-center hover:text-zinc-700">
                    Organisation <SortIcon active={sortCol === "org"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Consultant</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "status")} className="group inline-flex items-center hover:text-zinc-700">
                    Status <SortIcon active={sortCol === "status"} order={sortOrder} />
                  </a>
                </th>
                <th className="whitespace-nowrap px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "created_at")} className="group inline-flex items-center hover:text-zinc-700">
                    Created <SortIcon active={sortCol === "created_at"} order={sortOrder} />
                  </a>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {projects.map((p) => (
                <ClickableRow key={p.id} href={`/admin/projects/${p.id}`}>
                  <td className="max-w-[200px] truncate px-5 py-3 font-medium text-zinc-900">
                    {p.site_address ||
                      (p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) ||
                      (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8))}
                  </td>
                  <td className="max-w-[160px] truncate px-5 py-3 text-zinc-600">
                    {p.organisations?.name ?? "—"}
                  </td>
                  <td className="max-w-[160px] truncate px-5 py-3 text-zinc-600">
                    {p.consultant
                      ? [p.consultant.first_name, p.consultant.last_name].filter(Boolean).join(" ") || p.consultant.email
                      : <span className="text-zinc-400">Unassigned</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[p.status]}`}>
                        {STATUS_LABELS[p.status]}
                      </span>
                      {p.payment_override && (
                        <span className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Override</span>
                      )}
                      {p.expected_delivery_date &&
                        p.expected_delivery_date < todayIso &&
                        !TERMINAL_STATUSES.has(p.status) && (
                          <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Overdue</span>
                        )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                    {new Date(p.created_at).toLocaleDateString("en-AU")}
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-3 text-xs text-zinc-400">{projects.length} project{projects.length !== 1 ? "s" : ""}</p>
        </div>
      )}
    </div>
  );
}
