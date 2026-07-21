import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
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
  if (!active) return null;
  return <span className="ml-1">{order === "asc" ? "↑" : "↓"}</span>;
}

function accentClass(p: { status: ProjectStatus; payment_override: boolean; overdue: boolean }): string {
  if (p.overdue) return "border-l-red-400";
  if (p.payment_override) return "border-l-purple-400";
  return "border-l-zinc-200";
}

type ProjectRow = {
  id: string;
  project_number: string | null;
  po_number: string | null;
  site_address: string | null;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  payment_override: boolean;
  expected_delivery_date: string | null;
  created_at: string;
  clients: { name: string } | null;
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
      .from("clients")
      .select("id")
      .ilike("name", `%${org.trim()}%`);
    orgIds = matched?.map((o) => o.id as string) ?? [];
  }

  let query = supabase
    .from("projects")
    .select(`
      id,
      project_number,
      po_number,
      site_address,
      extracted_fields,
      status,
      payment_override,
      expected_delivery_date,
      created_at,
      clients(name),
      consultant:users!projects_assigned_consultant_id_fkey(first_name, last_name, email)
    `)
    .is("deleted_at", null);

  query = sortCol === "org"
    ? query.order("name", { referencedTable: "clients", ascending: sortOrder === "asc" })
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
    query = query.in("client_id", orgIds);
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">Projects</h1>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-blue-700">{projects.length}</span>
        </div>
        <Link
          href="/admin/projects/submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Submit request
        </Link>
      </div>

      <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search address or PO number…"
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 focus:border-zinc-400 focus:outline-none"
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
            placeholder="Client…"
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/projects"
              className="rounded-md border border-zinc-200 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Sort by</span>
        {([
          ["created_at", "Created"],
          ["expected_delivery_date", "Due date"],
          ["status", "Status"],
          ["org", "Client"],
        ] as [SortCol, string][]).map(([col, label]) => (
          <a
            key={col}
            href={sortHref(params, col)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              sortCol === col ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {label}
            <SortIcon active={sortCol === col} order={sortOrder} />
          </a>
        ))}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No projects match your filters." : "No projects yet."}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg">
          {projects.map((p) => {
            const addr = p.site_address || (p.extracted_fields?.["EXTRACT_ADDRESS"] as string | undefined) || null;
            const label = p.project_number && addr
              ? `${p.project_number} — ${addr}`
              : addr || (p.po_number ? `PO ${p.po_number}` : p.id.slice(0, 8));
            const consultant = p.consultant
              ? [p.consultant.first_name, p.consultant.last_name].filter(Boolean).join(" ") || p.consultant.email
              : null;
            const overdue = !!(
              p.expected_delivery_date &&
              p.expected_delivery_date < todayIso &&
              !TERMINAL_STATUSES.has(p.status)
            );

            return (
              <Link
                key={p.id}
                href={`/admin/projects/${p.id}`}
                className={`flex items-center gap-3 border-l-4 border-y border-r border-zinc-200 bg-white px-3 py-2.5 ${accentClass({ status: p.status, payment_override: p.payment_override, overdue })} hover:bg-zinc-50`}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-zinc-900">{label}</span>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {p.clients?.name ?? "—"} · {consultant ?? "Unassigned"} · Created{" "}
                    {new Date(p.created_at).toLocaleDateString("en-AU")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {overdue && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">Overdue</span>}
                  {p.payment_override && (
                    <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">Override</span>
                  )}
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${STATUS_CLASSES[p.status]}`}>
                    {STATUS_LABELS[p.status]}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
