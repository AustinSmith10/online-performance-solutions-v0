import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { ClickableRow } from "@/components/ClickableRow";

type TemplateRow = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  org: { id: string; name: string } | null;
};

const SORT_COLS = ["name", "created_at", "status", "org"] as const;
type SortCol = (typeof SORT_COLS)[number];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "created_at") === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/templates?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">↕</span>;
  return <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    inactive: "bg-zinc-100 text-zinc-500",
    draft: "bg-amber-100 text-amber-700",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? "bg-zinc-100 text-zinc-500"}`}>
      {status}
    </span>
  );
}

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; org?: string; sort?: string; order?: string }>;
}) {
  await requireRole("super_admin");

  const { q, status, org, sort, order } = await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "created_at";
  const sortOrder: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  const params = { q, status, org, sort, order };

  const supabase = createAdminClient();

  let orgIds: string[] | null = null;
  if (org?.trim()) {
    const { data: matched } = await supabase
      .from("organisations")
      .select("id")
      .ilike("name", `%${org.trim()}%`);
    orgIds = matched?.map((o) => o.id as string) ?? [];
  }

  let query = supabase
    .from("templates")
    .select("id, name, status, created_at, org:org_id(id, name)");
  query = sortCol === "org"
    ? query.order("name", { referencedTable: "organisations", ascending: sortOrder === "asc" })
    : query.order(sortCol, { ascending: sortOrder === "asc" });

  if (q?.trim()) query = query.ilike("name", `%${q.trim()}%`);
  if (status?.trim()) query = query.eq("status", status.trim());
  if (orgIds !== null) {
    if (orgIds.length === 0) {
      const hasFilter = !!(q || status || org);
      return <TemplatesLayout rows={[]} params={params} sortCol={sortCol} sortOrder={sortOrder} hasFilter={hasFilter} />;
    }
    query = query.in("org_id", orgIds);
  }

  const { data: templates } = await query;
  const rows = (templates ?? []) as unknown as TemplateRow[];
  const hasFilter = !!(q || status || org);

  return <TemplatesLayout rows={rows} params={params} sortCol={sortCol} sortOrder={sortOrder} hasFilter={hasFilter} />;
}

function TemplatesLayout({
  rows,
  params,
  sortCol,
  sortOrder,
  hasFilter,
}: {
  rows: TemplateRow[];
  params: Record<string, string | undefined>;
  sortCol: SortCol;
  sortOrder: "asc" | "desc";
  hasFilter: boolean;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Templates</h1>
        <Link
          href="/admin/templates/upload"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Upload template
        </Link>
      </div>

      <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search by name…"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <input
            type="text"
            name="org"
            defaultValue={params.org ?? ""}
            placeholder="Organisation…"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="inactive">Inactive</option>
          </select>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/templates"
              className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No templates match your filters." : "No templates yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "name")} className="group inline-flex items-center hover:text-zinc-700">
                    Name <SortIcon active={sortCol === "name"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "org")} className="group inline-flex items-center hover:text-zinc-700">
                    Organisation <SortIcon active={sortCol === "org"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "status")} className="group inline-flex items-center hover:text-zinc-700">
                    Status <SortIcon active={sortCol === "status"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "created_at")} className="group inline-flex items-center hover:text-zinc-700">
                    Uploaded <SortIcon active={sortCol === "created_at"} order={sortOrder} />
                  </a>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {rows.map((t) => (
                <ClickableRow key={t.id} href={`/admin/templates/${t.id}`}>
                  <td className="px-5 py-3 font-medium text-zinc-900">{t.name}</td>
                  <td className="px-5 py-3 text-zinc-600">
                    {t.org ? t.org.name : <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-5 py-3 text-zinc-500">
                    {new Date(t.created_at).toLocaleDateString("en-AU")}
                  </td>
                </ClickableRow>
              ))}
            </tbody>
          </table>
          <p className="px-5 py-3 text-xs text-zinc-400">{rows.length} template{rows.length !== 1 ? "s" : ""}</p>
        </div>
      )}
    </div>
  );
}
