import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { CATEGORIES, EVENT_LABELS, getCategoryInfo, formatDetails } from "@/lib/audit/taxonomy";
import { fetchAuditPage, SORT_COLS, type SortCol, type AuditRow } from "@/lib/audit/query";

import { ExportButton } from "./_components/ExportButton";
import { JumpToPage } from "./_components/JumpToPage";

const PAGE_SIZE = 50;

const LABEL = "text-xs font-medium text-zinc-600";
const FIELD =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 sm:w-auto";
const BTN_SECONDARY =
  "press rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:leading-6";
const PAGER_LINK =
  "press rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors duration-150 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:items-center";
const PAGER_DISABLED = "cursor-not-allowed rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-500 [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:items-center";
const CELL_LINK =
  "rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-700 transition-colors duration-150 hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:px-3";

// ─── Sort helpers ────────────────────────────────────────────────────────────

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

function buildExportHref(
  current: Record<string, string | undefined>,
  format: "csv" | "pdf"
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v && k !== "page") p.set(k, v);
  }
  p.set("format", format);
  return `/api/download/audit-export?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active)
    return (
      <span aria-hidden="true" className="ml-1 text-zinc-500 group-hover:text-zinc-700">
        ↕
      </span>
    );
  return (
    <span aria-hidden="true" className="ml-1 text-zinc-800">{order === "asc" ? "↑" : "↓"}</span>
  );
}

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

  const { entries, totalCount } = await fetchAuditPage(
    supabase,
    { email, category, event_type, org_name, from, to },
    sortCol,
    sortOrder,
    currentPage,
    PAGE_SIZE
  );

  const hasFilter = email || category || event_type || org_name || from || to;
  const activeCat = category?.trim() && CATEGORIES[category.trim()] ? category.trim() : null;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const rangeStart = totalCount === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const rangeEnd = Math.min((currentPage + 1) * PAGE_SIZE, totalCount);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Audit trail</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Immutable system event log.
            {totalCount > 0 && (
              <span className="tabular-nums">
                {" "}
                Showing {rangeStart}–{rangeEnd} of {totalCount.toLocaleString()} entries.
              </span>
            )}
          </p>
        </div>
        {totalCount > 0 && (
          <div className="flex shrink-0 items-start gap-2">
            <ExportButton href={buildExportHref(currentParams, "csv")} label="Export CSV" />
            <ExportButton
              href={buildExportHref(currentParams, "pdf")}
              label="Export PDF"
              title="A locked-down PDF rendering, for when the export must not be trivially editable"
            />
          </div>
        )}
      </div>

      {/* Filter form */}
      <form method="GET" className="rounded-xl border border-zinc-200 bg-white p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap">
          {/* Category */}
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-category" className={LABEL}>Category</label>
            <select
              id="audit-category"
              name="category"
              defaultValue={category ?? ""}
              className={FIELD}
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
            <label htmlFor="audit-event_type" className={LABEL}>Event</label>
            <select
              id="audit-event_type"
              name="event_type"
              defaultValue={event_type ?? ""}
              className={FIELD}
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
            <label htmlFor="audit-email" className={LABEL}>Actor email</label>
            <input
              type="text"
              id="audit-email"
              name="email"
              defaultValue={email ?? ""}
              placeholder="e.g. user@example.com"
              className={FIELD}
            />
          </div>

          {/* Org name */}
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-org_name" className={LABEL}>Client</label>
            <input
              type="text"
              id="audit-org_name"
              name="org_name"
              defaultValue={org_name ?? ""}
              placeholder="Client name"
              className={FIELD}
            />
          </div>

          {/* Date range */}
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-from" className={LABEL}>From</label>
            <input
              type="date"
              id="audit-from"
              name="from"
              defaultValue={from ?? ""}
              className={FIELD}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="audit-to" className={LABEL}>To</label>
            <input
              type="date"
              id="audit-to"
              name="to"
              defaultValue={to ?? ""}
              className={FIELD}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="press rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:min-h-10"
          >
            Search
          </button>
          {hasFilter && (
            <Link href="/admin/audit" className={BTN_SECONDARY}>
              Clear filters
            </Link>
          )}
          {hasFilter && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>Active:</span>
              {activeCat && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                  {CATEGORIES[activeCat].label}
                </span>
              )}
              {event_type && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
                  {EVENT_LABELS[event_type] ?? event_type}
                </span>
              )}
              {email && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">Email: {email}</span>}
              {org_name && (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">Client: {org_name}</span>
              )}
              {from && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">From {from}</span>}
              {to && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">To {to}</span>}
            </div>
          )}
        </div>
      </form>

      {/* Results */}
      {entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          <p>{hasFilter ? "No audit entries match these filters." : "No audit entries yet."}</p>
          {hasFilter && (
            <Link href="/admin/audit" className={`${BTN_SECONDARY} mt-3 inline-block`}>
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
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
                  <th
                    key={col}
                    aria-sort={sortCol === col ? (sortOrder === "asc" ? "ascending" : "descending") : "none"}
                    className="px-5 py-3 text-left text-xs font-semibold text-zinc-600">
                    <a
                      href={buildSortHref(currentParams, col)}
                      className="group inline-flex items-center [@media(pointer:coarse)]:min-h-10 transition-colors duration-150 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                    >
                      {label}
                      <SortIcon active={sortCol === col} order={sortOrder} />
                    </a>
                  </th>
                ))}
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-600">Client</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-600">Project</th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-zinc-600">Details</th>
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
                  <tr key={entry.id} className="transition-colors duration-150 hover:bg-zinc-50">
                    <td className="whitespace-nowrap px-5 py-3 text-xs tabular-nums text-zinc-500">
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
                            className="inline-block w-fit rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700"
                          >
                            {catInfo.label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-600">
                      {entry.actor_email ??
                        (entry.actor_id ? (
                          <span className="font-mono" title="This user no longer has an email on record">
                            {entry.actor_id.slice(0, 8)}
                          </span>
                        ) : (
                          "—"
                        ))}
                    </td>
                    <td className="px-5 py-3 text-xs text-zinc-700">{orgName}</td>
                    <td className="px-5 py-3 text-xs text-zinc-700">
                      {entry.project_id ? (
                        projectNumber ? (
                          <Link href={`/admin/projects/${entry.project_id}`} className={CELL_LINK}>
                            #{projectNumber}
                          </Link>
                        ) : entry.project ? (
                          <Link href={`/admin/projects/${entry.project_id}`} className={CELL_LINK}>
                            Open
                          </Link>
                        ) : (
                          <span className="font-mono" title="This project no longer exists">
                            {entry.project_id.slice(0, 8)}
                          </span>
                        )
                      ) : (
                        "—"
                      )}
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
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-3">
          <p className="text-xs tabular-nums text-zinc-500">
            Page {currentPage + 1} of {totalPages} &middot;{" "}
            {totalCount.toLocaleString()} total entries
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <JumpToPage baseHref={buildPageHref(currentParams, 0)} current={currentPage} totalPages={totalPages} />
            {currentPage > 0 ? (
              <Link href={buildPageHref(currentParams, currentPage - 1)} className={PAGER_LINK}>
                ← Previous
              </Link>
            ) : (
              <span aria-disabled="true" className={PAGER_DISABLED}>
                ← Previous
              </span>
            )}
            {currentPage < totalPages - 1 ? (
              <Link href={buildPageHref(currentParams, currentPage + 1)} className={PAGER_LINK}>
                Next →
              </Link>
            ) : (
              <span aria-disabled="true" className={PAGER_DISABLED}>
                Next →
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
