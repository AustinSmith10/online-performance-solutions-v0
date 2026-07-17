import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { User } from "@/types";

const SORT_COLS = ["invited_at", "first_name", "email"] as const;
type SortCol = (typeof SORT_COLS)[number];
const SORT_OPTIONS: { col: SortCol; label: string }[] = [
  { col: "first_name", label: "Name" },
  { col: "invited_at", label: "Invited" },
];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "invited_at") === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/clients?${p.toString()}`;
}

function SortPills({ params, sortCol, sortOrder }: { params: Record<string, string | undefined>; sortCol: SortCol; sortOrder: "asc" | "desc" }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-zinc-400">Sort:</span>
      {SORT_OPTIONS.map((o) => {
        const active = sortCol === o.col;
        return (
          <a
            key={o.col}
            href={sortHref(params, o.col)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
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

type ClientRow = Pick<User, "id" | "email" | "first_name" | "last_name" | "is_locked" | "invited_at"> & {
  clients: { name: string } | null;
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; org?: string; status?: string; sort?: string; order?: string }>;
}) {
  const { q, org, status, sort, order } = await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "invited_at";
  const sortOrder: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  const params = { q, org, status, sort, order };

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
    .from("users")
    .select("id, email, first_name, last_name, is_locked, invited_at, clients(name)")
    .eq("role", "stakeholder")
    .is("deleted_at", null)
    .order(sortCol, { ascending: sortOrder === "asc" });

  if (q?.trim()) {
    query = query.or(`email.ilike.%${q.trim()}%,first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`);
  }
  if (status === "locked") query = query.eq("is_locked", true);
  if (status === "active") query = query.eq("is_locked", false);
  if (orgIds !== null) {
    if (orgIds.length === 0) {
      return <ClientsLayout clients={[]} params={params} sortCol={sortCol} sortOrder={sortOrder} hasFilter />;
    }
    query = query.in("client_id", orgIds);
  }

  const { data } = await query;
  const clients = (data ?? []) as unknown as ClientRow[];
  const hasFilter = !!(q || org || status);

  return <ClientsLayout clients={clients} params={params} sortCol={sortCol} sortOrder={sortOrder} hasFilter={hasFilter} />;
}

function ClientsLayout({
  clients,
  params,
  sortCol,
  sortOrder,
  hasFilter,
}: {
  clients: ClientRow[];
  params: Record<string, string | undefined>;
  sortCol: SortCol;
  sortOrder: "asc" | "desc";
  hasFilter: boolean;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">Stakeholders</h1>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-blue-700">{clients.length}</span>
        </div>
      </div>

      <form method="GET" className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search name or email…"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <input
            type="text"
            name="org"
            defaultValue={params.org ?? ""}
            placeholder="Client…"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
          </select>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/clients"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {clients.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No clients match your filters." : "No clients yet."}
        </div>
      ) : (
        <div className="space-y-2">
          <SortPills params={params} sortCol={sortCol} sortOrder={sortOrder} />
          <div className="overflow-hidden rounded-lg">
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/admin/users/${c.id}`}
                className={`flex items-center gap-3 border-l-4 border-y border-r border-zinc-200 bg-white px-3 py-2.5 hover:bg-zinc-50 ${
                  c.is_locked ? "border-l-red-400" : "border-l-zinc-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-zinc-900">
                    {c.first_name && c.last_name ? `${c.first_name} ${c.last_name}` : c.email}
                  </span>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {c.clients?.name ?? "—"}
                    {c.invited_at ? ` · Invited ${new Date(c.invited_at).toLocaleDateString("en-AU")}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {c.is_locked ? (
                    <span className="whitespace-nowrap rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700">Locked</span>
                  ) : (
                    <span className="whitespace-nowrap rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-medium text-green-700">Active</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
