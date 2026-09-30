import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildProjectSearchFilter } from "@/lib/projects/search";
import type { ProjectStatus } from "@/types";
import { OverduePill } from "@/components/OverduePill";
import { ReviewTallyChip } from "@/components/ReviewTallyChip";
import { resolveStaffStatus } from "@/lib/delivery/effective-status";
import { summarizeRound, type RoundSummary } from "@/lib/stakeholders/round-summary";
import { tagsByUserIdFromEmbedded, type Tag } from "@/lib/tags/queries";
import { TagChips } from "@/components/TagChip";

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
  assigned: "bg-zinc-200 text-zinc-700",
  in_progress: "bg-purple-100 text-purple-700",
  dispatched: "bg-amber-100 text-amber-700",
  revision_required: "bg-red-100 text-red-700",
  converting: "bg-purple-100 text-purple-700",
  delivered: "bg-green-100 text-green-700",
  complete: "bg-zinc-100 text-zinc-500",
  paused: "bg-amber-100 text-amber-700",
};

const TERMINAL_STATUSES = new Set<ProjectStatus>(["delivered", "complete"]);

const PAGE_SIZE = 50;

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

function pageHref(params: Record<string, string | undefined>, page: number): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  p.set("page", String(page));
  return `/admin/projects?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return null;
  return <span className="ml-1">{order === "asc" ? "↑" : "↓"}</span>;
}

function accentClass(p: { status: ProjectStatus; payment_override: boolean; overdue: boolean }): string {
  if (p.overdue) return "border-l-red-400";
  if (p.payment_override) return "border-l-amber-400";
  return "border-l-zinc-200";
}

type ProjectRow = {
  id: string;
  project_number: string | null;
  po_number: string | null;
  site_address: string | null;
  extracted_fields: Record<string, string> | null;
  status: ProjectStatus;
  review_cycle: number;
  /** What staff should read the status as — see resolveStaffStatus. */
  displayStatus: ProjectStatus;
  tally?: RoundSummary;
  payment_override: boolean;
  expected_delivery_date: string | null;
  created_at: string;
  clients: { name: string } | null;
  consultant: { id: string; first_name: string | null; last_name: string | null; email: string } | null;
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; org?: string; sort?: string; order?: string; page?: string }>;
}) {
  const { q, status, org, sort, order, page: pageParam } = await searchParams;
  const page = Math.max(1, Number.parseInt(pageParam ?? "1", 10) || 1);

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "created_at";
  const sortOrder: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  const params = { q, status, org, sort, order };

  const supabase = createAdminClient();

  // The client-name filter is applied in the same query via an inner join on
  // clients (no separate lookup for matching ids first).
  const orgFilter = org?.trim() ?? "";

  let query = supabase
    .from("projects")
    .select(`
      id,
      project_number,
      po_number,
      site_address,
      extracted_fields,
      status,
      review_cycle,
      payment_override,
      expected_delivery_date,
      created_at,
      clients${orgFilter ? "!inner" : ""}(name),
      consultant:users!projects_assigned_consultant_id_fkey(id, first_name, last_name, email, account_tags!account_tags_user_id_fkey(tags(id, name, color))),
      stakeholder_reviews(review_cycle, status)
    `, { count: "exact" })
    .is("deleted_at", null);
  if (orgFilter) query = query.ilike("clients.name", `%${orgFilter}%`);

  query = sortCol === "org"
    ? query.order("name", { referencedTable: "clients", ascending: sortOrder === "asc" })
    : query.order(sortCol, { ascending: sortOrder === "asc" });
  // Tiebreaker so rows with equal sort values (e.g. the same status) don't
  // shuffle between pages.
  query = query.order("id", { ascending: true });

  const searchFilter = buildProjectSearchFilter(q);
  if (searchFilter) {
    query = query.or(searchFilter);
  }
  // "Awaiting Approval" and "Revision Required" are read off the round, not the
  // stored status alone, so either filter has to look at both before narrowing.
  const statusFilter = status?.trim() ?? "";
  const roundAwareFilter = statusFilter === "dispatched" || statusFilter === "revision_required";
  if (roundAwareFilter) query = query.in("status", ["dispatched", "revision_required"]);
  else if (statusFilter) query = query.eq("status", statusFilter);
  // Paginate in the database, except for the round-aware filters: those match
  // on the resolved status, which is only known after the rounds are read, so
  // that (small) set is fetched whole, filtered, then sliced below.
  if (!roundAwareFilter) query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { data, count } = await query;
  type RawProject = Omit<ProjectRow, "displayStatus" | "tally" | "consultant"> & {
    consultant: (NonNullable<ProjectRow["consultant"]> & { account_tags?: { tags: Tag | null }[] | null }) | null;
    stakeholder_reviews: { review_cycle: number; status: string }[] | null;
  };
  const rawProjects = (data ?? []) as unknown as RawProject[];

  const currentRoundOf = (p: RawProject) =>
    (p.stakeholder_reviews ?? []).filter((r) => r.review_cycle === p.review_cycle);

  const projects: ProjectRow[] = rawProjects
    .map(({ stakeholder_reviews: _reviews, consultant, ...p }) => {
      const inFlightRound = p.status === "dispatched" || p.status === "revision_required";
      const round = inFlightRound ? currentRoundOf({ ...p, consultant, stakeholder_reviews: _reviews }) : [];
      const displayStatus = p.status === "revision_required" ? resolveStaffStatus(p.status, round) : p.status;
      const inRound = displayStatus === "dispatched" || displayStatus === "revision_required";
      return {
        ...p,
        consultant: consultant ? { id: consultant.id, first_name: consultant.first_name, last_name: consultant.last_name, email: consultant.email } : null,
        displayStatus,
        tally: inRound && round.length > 0 ? summarizeRound(round) : undefined,
      };
    })
    .filter((p) => !roundAwareFilter || p.displayStatus === statusFilter);
  const total = roundAwareFilter ? projects.length : count ?? projects.length;
  const pageProjects = roundAwareFilter
    ? projects.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : projects;
  // Tags come back embedded on the consultant (one query, no follow-up lookup).
  const tagsByUser = tagsByUserIdFromEmbedded(
    rawProjects.flatMap((p) => (p.consultant ? [p.consultant] : []))
  );
  const todayIso = new Date().toISOString().slice(0, 10);
  const hasFilter = !!(q || status || org || sort || order);

  return <ProjectsLayout projects={pageProjects} todayIso={todayIso} params={params} sortCol={sortCol} sortOrder={sortOrder} hasFilter={hasFilter} tagsByUser={tagsByUser} page={page} total={total} />;
}

function ProjectsLayout({
  projects,
  todayIso,
  params,
  sortCol,
  sortOrder,
  hasFilter,
  tagsByUser,
  page,
  total,
}: {
  projects: ProjectRow[];
  todayIso: string;
  params: Record<string, string | undefined>;
  sortCol: SortCol;
  sortOrder: "asc" | "desc";
  hasFilter: boolean;
  tagsByUser?: Map<string, Tag[]>;
  page: number;
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">Projects</h1>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-blue-700">{total}</span>
        </div>
        <Link
          href="/admin/projects/submit"
          className="press rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
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
            placeholder="Search project number, address, or PO number…"
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none"
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
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none"
          />
          <button
            type="submit"
            className="press rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
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
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Sort by</span>
        {([
          ["created_at", "Created"],
          ["expected_delivery_date", "Due date"],
          ["status", "Status"],
          ["org", "Client"],
        ] as [SortCol, string][]).map(([col, label]) => (
          <a
            key={col}
            href={sortHref(params, col)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-1 ${
              sortCol === col ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {label}
            <SortIcon active={sortCol === col} order={sortOrder} />
          </a>
        ))}
      </div>

      {projects.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
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
            const daysOverdue = overdue
              ? Math.floor(
                  (new Date(todayIso).getTime() - new Date(p.expected_delivery_date!).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : undefined;

            return (
              <Link
                key={p.id}
                href={`/admin/projects/${p.id}`}
                className={`flex flex-col gap-2 border-l-4 border-y border-r border-zinc-200 bg-white px-3 py-2.5 transition-colors duration-150 sm:flex-row sm:items-center sm:gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-inset ${accentClass({ status: p.status, payment_override: p.payment_override, overdue })} hover:bg-zinc-50`}
              >
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-zinc-900">{label}</span>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {p.clients?.name ?? "—"} · {consultant ?? "Unassigned"}
                    {p.consultant && <TagChips tags={tagsByUser?.get(p.consultant.id)} className="ml-1.5 align-middle" />} · Created{" "}
                    {new Date(p.created_at).toLocaleDateString("en-AU")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:flex-nowrap">
                  {overdue && <OverduePill days={daysOverdue} />}
                  {p.payment_override && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Override</span>
                  )}
                  {p.tally && <ReviewTallyChip summary={p.tally} />}
                  <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CLASSES[p.displayStatus]}`}>
                    {STATUS_LABELS[p.displayStatus]}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-between text-sm text-zinc-600">
          <span className="tabular-nums">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={pageHref(params, page - 1)} className="press-subtle rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100">
                Previous
              </Link>
            )}
            {page < pageCount && (
              <Link href={pageHref(params, page + 1)} className="press-subtle rounded-md border border-zinc-300 px-3 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100">
                Next
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
