import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { AdminSuccessBanner } from "@/components/AdminSuccessBanner";

type TemplateRow = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  org: { id: string; name: string } | null;
};

const SORT_COLS = ["name", "created_at", "status", "org"] as const;
type SortCol = (typeof SORT_COLS)[number];
const SORT_OPTIONS: { col: SortCol; label: string }[] = [
  { col: "name", label: "Name" },
  { col: "org", label: "Client" },
  { col: "status", label: "Status" },
  { col: "created_at", label: "Uploaded" },
];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "created_at") === col;
  p.set("sort", col);
  // Active pill flips direction (default is newest first); a newly chosen one starts in its
  // natural direction: text A→Z, dates newest first.
  p.set("order", isActive ? (params.order === "asc" ? "desc" : "asc") : col === "created_at" ? "desc" : "asc");
  return `/admin/templates?${p.toString()}`;
}

function SortPills({ params, sortCol, sortOrder }: { params: Record<string, string | undefined>; sortCol: SortCol; sortOrder: "asc" | "desc" }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-zinc-500">Sort:</span>
      {SORT_OPTIONS.map((o) => {
        const active = sortCol === o.col;
        return (
          <a
            key={o.col}
            href={sortHref(params, o.col)}
            aria-current={active ? "true" : undefined}
            className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-150 ${
              active ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {o.label} {active ? (sortOrder === "asc" ? "↑" : "↓") : ""}
          </a>
        );
      })}
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  inactive: "bg-zinc-100 text-zinc-500",
  draft: "bg-amber-100 text-amber-700",
};
const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  inactive: "Inactive",
  draft: "Draft",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-zinc-100 text-zinc-500"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; org?: string; sort?: string; order?: string; deleted?: string }>;
}) {
  await requireRole("super_admin", "admin");

  const { q, status, org, sort, order, deleted } = await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "created_at";
  const sortOrder: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  const params = { q, status, org, sort, order };

  const supabase = createAdminClient();

  let orgIds: string[] | null = null;
  if (org?.trim()) {
    const { data: matched } = await supabase
      .from("clients")
      .select("id")
      .ilike("name", `%${org.trim()}%`);
    orgIds = matched?.map((o) => o.id as string) ?? [];
  }

  let query = supabase
    .from("templates")
    .select("id, name, status, created_at, org:client_id(id, name)")
    .is("deleted_at", null);
  query = sortCol === "org"
    ? query.order("name", { referencedTable: "clients", ascending: sortOrder === "asc" })
    : query.order(sortCol, { ascending: sortOrder === "asc" });

  if (q?.trim()) query = query.ilike("name", `%${q.trim()}%`);
  if (status?.trim()) query = query.eq("status", status.trim());
  if (orgIds !== null) {
    if (orgIds.length === 0) {
      const hasFilter = !!(q || status || org || sort || order);
      return <TemplatesLayout rows={[]} params={params} sortCol={sortCol} sortOrder={sortOrder} hasFilter={hasFilter} deleted={deleted} />;
    }
    query = query.in("client_id", orgIds);
  }

  const { data: templates } = await query;
  const rows = (templates ?? []) as unknown as TemplateRow[];
  const hasFilter = !!(q || status || org || sort || order);

  return <TemplatesLayout rows={rows} params={params} sortCol={sortCol} sortOrder={sortOrder} hasFilter={hasFilter} deleted={deleted} />;
}

function TemplatesLayout({
  rows,
  params,
  sortCol,
  sortOrder,
  hasFilter,
  deleted,
}: {
  rows: TemplateRow[];
  params: Record<string, string | undefined>;
  sortCol: SortCol;
  sortOrder: "asc" | "desc";
  hasFilter: boolean;
  deleted?: string;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Templates</h1>
        <Link
          href="/admin/templates/upload"
          className="press-subtle w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto"
        >
          Upload template
        </Link>
      </div>

      <form method="GET" className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            aria-label="Search by name"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search by name…"
            className="w-full sm:w-auto rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <input
            type="text"
            aria-label="Client"
            name="org"
            defaultValue={params.org ?? ""}
            placeholder="Client…"
            className="w-full sm:w-auto rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <select
            name="status"
            aria-label="Filter by status"
            defaultValue={params.status ?? ""}
            className="min-w-0 flex-1 sm:flex-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/templates"
              className="press-subtle w-full rounded-md border border-zinc-300 px-4 py-2 text-center text-sm text-zinc-600 hover:bg-zinc-100 sm:w-auto"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No templates match your filters." : "No templates yet."}
        </div>
      ) : (
        <div className="space-y-2">
          <SortPills params={params} sortCol={sortCol} sortOrder={sortOrder} />
          <div className="overflow-hidden rounded-lg">
            {rows.map((t) => (
              <Link
                key={t.id}
                href={`/admin/templates/${t.id}`}
                className={`flex items-center gap-3 border-l-[3px] border-y border-r border-zinc-200 bg-white px-3 py-2.5 transition-colors duration-150 hover:bg-zinc-50 focus-visible:relative focus-visible:z-10 ${
                  t.status === "draft" ? "border-l-amber-400" : "border-l-zinc-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-zinc-900">{t.name}</span>
                  <p className="mt-0.5 truncate text-xs tabular-nums text-zinc-500">
                    {t.org ? t.org.name : "—"} · Uploaded {new Date(t.created_at).toLocaleDateString("en-AU")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <StatusBadge status={t.status} />
                </div>
              </Link>
            ))}
          </div>
          <p className="text-xs tabular-nums text-zinc-500">{rows.length} template{rows.length !== 1 ? "s" : ""}</p>
        </div>
      )}

      {deleted === "1" && (
        <AdminSuccessBanner
          cleanUrl="/admin/templates"
          title="Template deleted"
          body="The template has been moved to the recovery bin and can be restored."
        />
      )}
    </div>
  );
}
