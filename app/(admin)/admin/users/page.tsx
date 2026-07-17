import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
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

const ALL_SORT_OPTIONS: { col: AllSortCol; label: string }[] = [
  { col: "email", label: "User" },
  { col: "role", label: "Role" },
  { col: "org", label: "Client" },
  { col: "created_at", label: "Joined" },
];
const CONSULTANT_SORT_OPTIONS: { col: ConsultantSortCol; label: string }[] = [
  { col: "first_name", label: "Name" },
  { col: "availability", label: "Availability" },
];

function sortHref(params: Record<string, string | undefined>, col: string): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = params.sort === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/users?${p.toString()}`;
}

function SortPills<Col extends string>({
  params,
  sortCol,
  sortOrder,
  options,
}: {
  params: Record<string, string | undefined>;
  sortCol: Col;
  sortOrder: "asc" | "desc";
  options: { col: Col; label: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-zinc-400">Sort:</span>
      {options.map((o) => {
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

type UserRow = Pick<User, "id" | "email" | "first_name" | "last_name" | "role" | "availability" | "is_locked" | "created_at"> & {
  clients: { name: string } | null;
};

const TABS = [
  { key: "all", label: "All" },
  { key: "consultants", label: "Consultants" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function TabBar({ tab }: { tab: Tab }) {
  return (
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
  );
}

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

        <TabBar tab={tab} />

        <div>
          <p className="mb-4 text-sm text-zinc-500">
            Availability is set by each consultant from their workspace. Super Admins can also update it from the user detail page.
          </p>
          <form method="GET" className="rounded-xl border border-zinc-200 bg-white p-4">
            <input type="hidden" name="tab" value="consultants" />
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search name or email…"
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <select
                name="availability"
                defaultValue={availability ?? ""}
                className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="">All availability</option>
                <option value="available">Available</option>
                <option value="on_leave">On leave</option>
                <option value="at_capacity">At capacity</option>
              </select>
              <select
                name="status"
                defaultValue={status ?? ""}
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
                  href="/admin/users?tab=consultants"
                  className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
                >
                  Clear
                </Link>
              )}
            </div>
          </form>
        </div>

        {users.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            {hasFilter ? "No consultants match your filters." : "No consultants yet."}
          </div>
        ) : (
          <div className="space-y-2">
            <SortPills params={params} sortCol={sort && CONSULTANT_SORT_COLS.includes(sort as ConsultantSortCol) ? (sort as ConsultantSortCol) : "first_name"} sortOrder={sortOrder} options={CONSULTANT_SORT_OPTIONS} />
            <div className="overflow-hidden rounded-lg">
              {users.map((u) => (
                <Link
                  key={u.id}
                  href={`/admin/users/${u.id}`}
                  className={`flex items-center gap-3 border-l-4 border-y border-r border-zinc-200 bg-white px-3 py-2.5 hover:bg-zinc-50 ${
                    u.is_locked ? "border-l-red-400" : u.availability === "at_capacity" ? "border-l-amber-400" : "border-l-zinc-200"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium text-zinc-900">
                      {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
                    </span>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{u.clients?.name ?? "—"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {u.is_locked ? (
                      <span className="whitespace-nowrap rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700">Locked</span>
                    ) : (
                      <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${AVAILABILITY_CLASSES[u.availability as ConsultantAvailability] ?? "bg-zinc-100 text-zinc-600"}`}>
                        {AVAILABILITY_LABELS[u.availability as ConsultantAvailability] ?? u.availability}
                      </span>
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

      <TabBar tab={tab} />

      <form method="GET" className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or email…"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <select
            name="role"
            defaultValue={role ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="consultant">Consultant</option>
          </select>
          <select
            name="status"
            defaultValue={status ?? ""}
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
              href="/admin/users"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {users.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No users match your filters." : "No users yet."}
        </div>
      ) : (
        <div className="space-y-2">
          <SortPills params={params} sortCol={sortCol} sortOrder={sortOrder} options={ALL_SORT_OPTIONS} />
          <div className="overflow-hidden rounded-lg">
            {users.map((u) => (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}`}
                className={`flex items-center gap-3 border-l-4 border-y border-r border-zinc-200 bg-white px-3 py-2.5 hover:bg-zinc-50 ${
                  u.is_locked ? "border-l-red-400" : u.role === "consultant" && u.availability === "at_capacity" ? "border-l-amber-400" : "border-l-zinc-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-zinc-900">
                    {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
                  </span>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {ROLE_LABELS[u.role] ?? u.role} · {u.clients?.name ?? "—"} · Joined {new Date(u.created_at).toLocaleDateString("en-AU")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {u.is_locked ? (
                    <span className="whitespace-nowrap rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700">Locked</span>
                  ) : u.role === "consultant" ? (
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${AVAILABILITY_CLASSES[u.availability as ConsultantAvailability] ?? "bg-zinc-100 text-zinc-600"}`}>
                      {AVAILABILITY_LABELS[u.availability as ConsultantAvailability] ?? u.availability}
                    </span>
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
