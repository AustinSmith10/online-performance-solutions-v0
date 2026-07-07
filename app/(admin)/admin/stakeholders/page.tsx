import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { User } from "@/types";

const SORT_COLS = ["invited_at", "first_name", "email"] as const;
type SortCol = (typeof SORT_COLS)[number];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "invited_at") === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/clients?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">↕</span>;
  return <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>;
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

      <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Search name or email…"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <input
            type="text"
            name="org"
            defaultValue={params.org ?? ""}
            placeholder="Client…"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <select
            name="status"
            defaultValue={params.status ?? ""}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
          </select>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/clients"
              className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {clients.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No clients match your filters." : "No clients yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "first_name")} className="group inline-flex items-center hover:text-zinc-700">
                    Name <SortIcon active={sortCol === "first_name"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Client</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "invited_at")} className="group inline-flex items-center hover:text-zinc-700">
                    Invited <SortIcon active={sortCol === "invited_at"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {clients.map((c) => (
                <ClickableRow key={c.id} href={`/admin/users/${c.id}`}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-zinc-900">
                      {c.first_name && c.last_name ? `${c.first_name} ${c.last_name}` : c.email}
                    </span>
                    {(c.first_name || c.last_name) && (
                      <div className="text-xs text-zinc-400">{c.email}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{c.clients?.name ?? "—"}</td>
                  <td className="px-5 py-3 text-zinc-500">
                    {c.invited_at ? new Date(c.invited_at).toLocaleDateString("en-AU") : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {c.is_locked ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Locked</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                    )}
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
