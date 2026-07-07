import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { ClickableRow } from "@/components/ClickableRow";
import { CreateAccountModal } from "./_components/CreateAccountModal";
import type { User, Client, ConsultantAvailability } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  consultant: "Consultant",
  stakeholder: "Stakeholder",
};

const AVAILABILITY_LABELS: Record<ConsultantAvailability, string> = {
  available: "Available",
  on_leave: "On leave",
  at_capacity: "At capacity",
};

const AVAILABILITY_CLASSES: Record<ConsultantAvailability, string> = {
  available: "bg-green-100 text-green-700",
  on_leave: "bg-yellow-100 text-yellow-700",
  at_capacity: "bg-zinc-100 text-zinc-600",
};

const ALL_SORT_COLS = ["created_at", "email", "role", "org"] as const;
const CONSULTANT_SORT_COLS = ["first_name", "email", "availability"] as const;
type AllSortCol = (typeof ALL_SORT_COLS)[number];
type ConsultantSortCol = (typeof CONSULTANT_SORT_COLS)[number];

function sortHref(params: Record<string, string | undefined>, col: string): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = params.sort === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/users?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">↕</span>;
  return <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>;
}

type UserRow = Pick<User, "id" | "email" | "first_name" | "last_name" | "role" | "availability" | "is_locked" | "created_at"> & {
  clients: { name: string } | null;
};

const TABS = [
  { key: "all", label: "All" },
  { key: "consultants", label: "Consultants" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; availability?: string; status?: string; sort?: string; order?: string; tab?: string }>;
}) {
  const { q, role, availability, status, sort, order, tab: tabParam } = await searchParams;

  const tab: Tab = tabParam === "consultants" ? "consultants" : "all";
  const isConsultantsTab = tab === "consultants";

  const sortOrder: "asc" | "desc" = order === "asc" ? "asc" : "desc";

  const [caller, supabaseClient] = await Promise.all([
    requireRole("super_admin", "admin"),
    Promise.resolve(createAdminClient()),
  ]);
  const supabase = supabaseClient;

  const { data: orgsData } = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true });
  const orgs = (orgsData ?? []) as Pick<Client, "id" | "name">[];

  let query = supabase
    .from("users")
    .select("id, email, first_name, last_name, role, availability, is_locked, created_at, clients(name)")
    .is("deleted_at", null);

  if (isConsultantsTab) {
    const sortCol: ConsultantSortCol = CONSULTANT_SORT_COLS.includes(sort as ConsultantSortCol)
      ? (sort as ConsultantSortCol)
      : "first_name";
    query = query.eq("role", "consultant").order(sortCol, { ascending: sortOrder === "asc" });

    if (q?.trim()) {
      query = query.or(`email.ilike.%${q.trim()}%,first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`);
    }
    if (availability?.trim()) query = query.eq("availability", availability.trim());
    if (status === "locked") query = query.eq("is_locked", true);
    if (status === "active") query = query.eq("is_locked", false);

    const { data } = await query;
    const users = (data ?? []) as unknown as UserRow[];
    const sortCol2: ConsultantSortCol = CONSULTANT_SORT_COLS.includes(sort as ConsultantSortCol)
      ? (sort as ConsultantSortCol)
      : "first_name";
    const hasFilter = !!(q || availability || status);
    const params = { q, availability, status, sort, order, tab };

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-zinc-900">Internal Users</h1>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-blue-700">{users.length}</span>
          </div>
          <CreateAccountModal orgs={orgs} callerRole={caller.role as string} />
        </div>

        <div className="flex gap-1 border-b border-zinc-200">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={`/admin/users?tab=${t.key}`}
              className={`px-4 py-2 text-sm font-medium ${
                tab === t.key
                  ? "border-b-2 border-zinc-900 text-zinc-900"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>

        <div>
          <p className="mb-4 text-sm text-zinc-500">
            Availability is set by each consultant from their workspace. Super Admins can also update it from the user detail page.
          </p>
          <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4">
            <input type="hidden" name="tab" value="consultants" />
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search name or email…"
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              />
              <select
                name="availability"
                defaultValue={availability ?? ""}
                className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
              >
                <option value="">All availability</option>
                <option value="available">Available</option>
                <option value="on_leave">On leave</option>
                <option value="at_capacity">At capacity</option>
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
                  href="/admin/users?tab=consultants"
                  className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
                >
                  Clear
                </Link>
              )}
            </div>
          </form>
        </div>

        {users.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            {hasFilter ? "No consultants match your filters." : "No consultants yet."}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <table className="w-full min-w-[400px] text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50">
                <tr>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">
                    <a href={sortHref(params, "first_name")} className="group inline-flex items-center hover:text-zinc-700">
                      Name <SortIcon active={sortCol2 === "first_name"} order={sortOrder} />
                    </a>
                  </th>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">Client</th>
                  <th className="px-5 py-3 text-left font-medium text-zinc-500">
                    <a href={sortHref(params, "availability")} className="group inline-flex items-center hover:text-zinc-700">
                      Availability <SortIcon active={sortCol2 === "availability"} order={sortOrder} />
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
                    <td className="px-5 py-3 text-zinc-600">{u.clients?.name ?? "—"}</td>
                    <td className="px-5 py-3">
                      {u.is_locked ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Locked</span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${AVAILABILITY_CLASSES[u.availability as ConsultantAvailability] ?? "bg-zinc-100 text-zinc-600"}`}>
                          {AVAILABILITY_LABELS[u.availability as ConsultantAvailability] ?? u.availability}
                        </span>
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

  // All tab
  const sortCol: AllSortCol = ALL_SORT_COLS.includes(sort as AllSortCol) ? (sort as AllSortCol) : "created_at";
  const params = { q, role, status, sort, order, tab };

  query = sortCol === "org"
    ? query.order("name", { referencedTable: "clients", ascending: sortOrder === "asc" })
    : query.order(sortCol, { ascending: sortOrder === "asc" });

  query = query.neq("role", "stakeholder");

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
          <h1 className="text-xl font-semibold text-zinc-900">Internal Users</h1>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-blue-700">{users.length}</span>
        </div>
        <CreateAccountModal orgs={orgs} callerRole={caller.role as string} />
      </div>

      <div className="flex gap-1 border-b border-zinc-200">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/users?tab=${t.key}`}
            className={`px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
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
            <option value="admin">Admin</option>
            <option value="consultant">Consultant</option>
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
                    Client <SortIcon active={sortCol === "org"} order={sortOrder} />
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
                  <td className="px-5 py-3 text-zinc-600">{u.clients?.name ?? "—"}</td>
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
