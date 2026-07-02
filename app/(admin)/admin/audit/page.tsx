import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORIES, EVENT_LABELS, getCategoryInfo, formatDetails } from "@/lib/audit/taxonomy";

const PAGE_SIZE = 50;

// ─── Sort helpers ────────────────────────────────────────────────────────────

const SORT_COLS = ["created_at", "event_type", "actor_email"] as const;
type SortCol = (typeof SORT_COLS)[number];

function buildSortHref(
  current: Record<string, string | undefined>,
  col: SortCol
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v && k !== "page") p.set(k, v); // reset to page 0 on sort change
  }
  const isActive = (current.sort ?? "created_at") === col;
  p.set("sort", col);
  p.set("order", isActive && current.order !== "asc" ? "asc" : "desc");
  return `/admin/audit?${p.toString()}`;
}

function buildPageHref(
  current: Record<string, string | undefined>,
  page: number
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v && k !== "page") p.set(k, v);
  }
  if (page > 0) p.set("page", String(page));
  return `/admin/audit?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active)
    return (
      <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">
        ↕
      </span>
    );
  return (
    <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>
  );
}

// ─── Types ───────────────────────────────────────────────────────────────────

type AuditRow = {
  id: string;
  event_type: string;
  actor_id: string | null;
  actor_email: string | null;
  project_id: string | null;
  client_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  project: { project_number: string | null } | null;
  org: { name: string } | null;
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    email?: string;
    category?: string;
    event_type?: string;
    org_name?: string;
    from?: string;
    to?: string;
    sort?: string;
    order?: string;
    page?: string;
  }>;
}) {
  await requireRole("super_admin", "admin");

  const { email, category, event_type, org_name, from, to, sort, order, page } =
    await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol)
    ? (sort as SortCol)
    : "created_at";
  const sortOrder: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  const currentPage = Math.max(0, parseInt(page ?? "0", 10) || 0);
  const currentParams = { email, category, event_type, org_name, from, to, sort, order, page };

  const supabase = createAdminClient();

  // Resolve org name to IDs
  let orgIds: string[] | null = null;
  if (org_name?.trim()) {
    const { data: orgs } = await supabase
      .from("clients")
      .select("id")
      .ilike("name", `%${org_name.trim()}%`);
    orgIds = orgs?.map((o) => o.id as string) ?? [];
  }

  let entries: AuditRow[] = [];
  let totalCount = 0;

  // Skip query if org filter matched nothing
  if (orgIds === null || orgIds.length > 0) {
    let query = supabase
      .from("audit_log")
      .select("*, project:projects(project_number), org:clients(name)", { count: "exact" })
      .order(sortCol, { ascending: sortOrder === "asc" })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (email?.trim()) {
      query = query.ilike("actor_email", `%${email.trim()}%`);
    }

    // event_type takes precedence over category
    if (event_type?.trim()) {
      query = query.eq("event_type", event_type.trim());
    } else if (category?.trim() && CATEGORIES[category.trim()]) {
      query = query.in("event_type", CATEGORIES[category.trim()].events);
    }

    if (orgIds !== null && orgIds.length > 0) {
      query = query.in("client_id", orgIds);
    }

    if (from?.trim()) {
      query = query.gte("created_at", new Date(from.trim()).toISOString());
    }
    if (to?.trim()) {
      const toDate = new Date(to.trim());
      toDate.setDate(toDate.getDate() + 1);
      query = query.lt("created_at", toDate.toISOString());
    }

    const { data, count } = await query;
    entries = (data ?? []) as AuditRow[];
    totalCount = count ?? 0;
  }

  const hasFilter = email || category || event_type || org_name || from || to;
  const activeCat = category?.trim() && CATEGORIES[category.trim()] ? category.trim() : null;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const rangeStart = totalCount === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const rangeEnd = Math.min((currentPage + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Audit trail</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Immutable system event log.{" "}
          {totalCount > 0
            ? `Showing ${rangeStart}–${rangeEnd} of ${totalCount.toLocaleString()} entries.`
            : "No entries found."}
        </p>
      </div>

      {/* Filter form */}
      <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          {/* Category */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Category
            </label>
            <select
              name="category"
              defaultValue={category ?? ""}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <option value="">All categories</option>
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <option key={key} value={key}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Event type */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Event
            </label>
            <select
              name="event_type"
              defaultValue={event_type ?? ""}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            >
              <option value="">All events</option>
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <optgroup key={key} label={cat.label}>
                  {cat.events.map((ev) => (
                    <option key={ev} value={ev}>
                      {EVENT_LABELS[ev] ?? ev}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Actor email */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Actor email
            </label>
            <input
              type="text"
              name="email"
              defaultValue={email ?? ""}
              placeholder="e.g. user@example.com"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>

          {/* Org name */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              Client
            </label>
            <input
              type="text"
              name="org_name"
              defaultValue={org_name ?? ""}
              placeholder="Client name"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              From
            </label>
            <input
              type="date"
              name="from"
              defaultValue={from ?? ""}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
              To
            </label>
            <input
              type="date"
              name="to"
              defaultValue={to ?? ""}
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Search
          </button>
          {hasFilter && (
            <a
              href="/admin/audit"
              className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear filters
            </a>
          )}
          {hasFilter && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>Active:</span>
              {activeCat && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORIES[activeCat].color}`}>
                  {CATEGORIES[activeCat].label}
                </span>
              )}
              {event_type && (
                <span className="rounded bg-zinc-100 px-2 py-0.5">
                  {EVENT_LABELS[event_type] ?? event_type}
                </span>
              )}
              {email && <span className="rounded bg-zinc-100 px-2 py-0.5">Email: {email}</span>}
              {org_name && (
                <span className="rounded bg-zinc-100 px-2 py-0.5">Org: {org_name}</span>
              )}
              {from && <span className="rounded bg-zinc-100 px-2 py-0.5">From {from}</span>}
              {to && <span className="rounded bg-zinc-100 px-2 py-0.5">To {to}</span>}
            </div>
          )}
        </div>
      </form>

      {/* Results */}
      {entries.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No audit entries found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                {(
                  [
                    { label: "Timestamp", col: "created_at" },
                    { label: "Event", col: "event_type" },
                    { label: "Actor", col: "actor_email" },
                  ] as { label: string; col: SortCol }[]
                ).map(({ label, col }) => (
                  <th key={col} className="px-5 py-3 text-left font-medium text-zinc-500">
                    <a
                      href={buildSortHref(currentParams, col)}
                      className="group inline-flex items-center hover:text-zinc-700"
                    >
                      {label}
                      <SortIcon active={sortCol === col} order={sortOrder} />
                    </a>
                  </th>
                ))}
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Client</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Project</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {entries.map((entry) => {
                const catInfo = getCategoryInfo(entry.event_type);
                const label = EVENT_LABELS[entry.event_type] ?? entry.event_type;
                const details = formatDetails(entry.event_type, entry.metadata);
                const orgName = entry.org?.name ?? "—";
                const projectNumber = entry.project?.project_number;

                return (
                  <tr key={entry.id} className="hover:bg-blue-50">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-zinc-500">
                      {new Date(entry.created_at).toLocaleString("en-AU", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-medium text-zinc-800">{label}</span>
                        {catInfo && (
                          <span
                            className={`inline-block w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${catInfo.color}`}
                          >
                            {catInfo.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-600">
                      {entry.actor_email ??
                        (entry.actor_id ? entry.actor_id.slice(0, 8) + "…" : "—")}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-700">{orgName}</td>
                    <td className="px-5 py-3 text-xs text-zinc-700">
                      {projectNumber
                        ? `#${projectNumber}`
                        : entry.project_id
                          ? entry.project_id.slice(0, 8) + "…"
                          : "—"}
                    </td>
                    <td className="max-w-[360px] whitespace-normal break-words px-5 py-3 text-xs text-zinc-500">
                      {details || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-5 py-3">
          <p className="text-xs text-zinc-500">
            Page {currentPage + 1} of {totalPages} &middot;{" "}
            {totalCount.toLocaleString()} total entries
          </p>
          <div className="flex gap-2">
            {currentPage > 0 ? (
              <a
                href={buildPageHref(currentParams, currentPage - 1)}
                className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                ← Previous
              </a>
            ) : (
              <span className="rounded border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-300">
                ← Previous
              </span>
            )}
            {currentPage < totalPages - 1 ? (
              <a
                href={buildPageHref(currentParams, currentPage + 1)}
                className="rounded border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Next →
              </a>
            ) : (
              <span className="rounded border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-300">
                Next →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
