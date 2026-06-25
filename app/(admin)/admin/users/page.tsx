import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { User } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  consultant: "Consultant",
  client: "Client",
};

const SORT_COLS = ["created_at", "email", "role", "org"] as const;
type SortCol = (typeof SORT_COLS)[number];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "created_at") === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/users?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">↕</span>;
  return <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>;
}

type UserRow = Pick<User, "id" | "email" | "first_name" | "last_name" | "role" | "availability" | "is_locked" | "created_at"> & {
  organisations: { name: string } | null;
};

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; status?: string; sort?: string; order?: string }>;
}) {
  const { q, role, status, sort, order } = await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "created_at";
  const sortOrder: "asc" | "desc" = order === "asc" ? "asc" : "desc";
  const params = { q, role, status, sort, order };

  const supabase = createAdminClient();
  let query = supabase
    .from("users")
    .select("id, email, first_name, last_name, role, availability, is_locked, created_at, organisations(name)");

  query = sortCol === "org"
    ? query.order("name", { referencedTable: "organisations", ascending: sortOrder === "asc" })
    : query.order(sortCol, { ascending: sortOrder === "asc" });

  if (q?.trim()) {
    query = query.or(`email.ilike.%${q.trim()}%,first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`);
  }
  if (role?.trim()) query = query.eq("role", role.trim());
  if (status === "locked") query = query.eq("is_locked", true);
  if (status === "active") query = query.eq("is_locked", false);

  const { data } = await query;
  const users = (data ?? []) as unknown as UserRow[];
  const hasFilter = !!(q || role || status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">Users</h1>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-blue-700">{users.length}</span>
        </div>
        <Link
          href="/admin/users/invite"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          + Invite user
        </Link>
      </div>

      <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or email…"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <select
            name="role"
            defaultValue={role ?? ""}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            <option value="">All roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="consultant">Consultant</option>
            <option value="client">Client</option>
          </select>
          <select
            name="status"
            defaultValue={status ?? ""}
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
              href="/admin/users"
              className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {users.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No users match your filters." : "No users yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[500px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "email")} className="group inline-flex items-center hover:text-zinc-700">
                    User <SortIcon active={sortCol === "email"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "role")} className="group inline-flex items-center hover:text-zinc-700">
                    Role <SortIcon active={sortCol === "role"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "org")} className="group inline-flex items-center hover:text-zinc-700">
                    Organisation <SortIcon active={sortCol === "org"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "created_at")} className="group inline-flex items-center hover:text-zinc-700">
                    Joined <SortIcon active={sortCol === "created_at"} order={sortOrder} />
                  </a>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {users.map((u) => (
                <ClickableRow key={u.id} href={`/admin/users/${u.id}`}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-zinc-900">
                      {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
                    </span>
                    {(u.first_name || u.last_name) && (
                      <div className="text-xs text-zinc-400">{u.email}</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{ROLE_LABELS[u.role] ?? u.role}</td>
                  <td className="px-5 py-3 text-zinc-600">{u.organisations?.name ?? "—"}</td>
                  <td className="px-5 py-3">
                    {u.is_locked ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Locked</span>
                    ) : u.role === "consultant" ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        u.availability === "available" ? "bg-green-100 text-green-700"
                          : u.availability === "on_leave" ? "bg-yellow-100 text-yellow-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}>
                        {u.availability === "available" ? "Available"
                          : u.availability === "on_leave" ? "On leave"
                          : "At capacity"}
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-zinc-500">
                    {new Date(u.created_at).toLocaleDateString("en-AU")}
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
