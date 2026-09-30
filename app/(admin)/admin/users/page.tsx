import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { getFailedInviteEmails } from "@/lib/admin/invite-status";
import { DisciplineChips } from "./_components/DisciplineChips";
import { CreateAccountModal } from "./_components/CreateAccountModal";
import type { User, Client, ConsultantAvailability } from "@/types";
import { getTagsByUserId } from "@/lib/tags/queries";
import { TagChips } from "@/components/TagChip";

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
  on_leave: "bg-zinc-100 text-zinc-600",
  at_capacity: "bg-zinc-100 text-zinc-600",
};

const ALL_SORT_COLS = ["created_at", "email", "role"] as const;
const CONSULTANT_SORT_COLS = ["first_name", "email", "availability"] as const;
type AllSortCol = (typeof ALL_SORT_COLS)[number];
type ConsultantSortCol = (typeof CONSULTANT_SORT_COLS)[number];

const ALL_SORT_OPTIONS: { col: AllSortCol; label: string }[] = [
  { col: "email", label: "User" },
  { col: "role", label: "Role" },
  { col: "created_at", label: "Joined" },
];
const CONSULTANT_SORT_OPTIONS: { col: ConsultantSortCol; label: string }[] = [
  { col: "first_name", label: "Name" },
  { col: "availability", label: "Availability" },
];

// Dates read newest first; everything else A→Z.
function naturalOrder(col: string): "asc" | "desc" {
  return col === "created_at" ? "desc" : "asc";
}

function sortHref(
  params: Record<string, string | undefined>,
  col: string,
  activeCol: string,
  activeOrder: "asc" | "desc"
): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  p.set("sort", col);
  // The active pill flips direction; a newly chosen one starts in its natural direction.
  p.set("order", col === activeCol ? (activeOrder === "asc" ? "desc" : "asc") : naturalOrder(col));
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
      <span className="text-xs text-zinc-500">Sort:</span>
      {options.map((o) => {
        const active = sortCol === o.col;
        return (
          <a
            key={o.col}
            href={sortHref(params, o.col, sortCol, sortOrder)}
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

type UserRow = Pick<User, "id" | "email" | "first_name" | "last_name" | "role" | "availability" | "is_locked" | "created_at" | "disciplines"> & {
  clients: { name: string } | null;
};

const TABS = [
  { key: "all", label: "All" },
  { key: "consultants", label: "Consultants" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function TabBar({ tab }: { tab: Tab }) {
  return (
    <div className="border-b border-zinc-200">
      <nav aria-label="User groups" className="-mx-1 flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/users?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors duration-150 ${
              tab === t.key
                ? "border-zinc-900 text-zinc-900"
                : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>
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

  const orderParam: "asc" | "desc" | undefined = order === "asc" || order === "desc" ? order : undefined;

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
    .select("id, email, first_name, last_name, role, availability, is_locked, created_at, disciplines, clients(name)")
    .is("deleted_at", null);

  if (isConsultantsTab) {
    const sortCol: ConsultantSortCol = CONSULTANT_SORT_COLS.includes(sort as ConsultantSortCol)
      ? (sort as ConsultantSortCol)
      : "first_name";
    const sortOrder = orderParam ?? naturalOrder(sortCol);
    query = query.eq("role", "consultant").order(sortCol, { ascending: sortOrder === "asc" });

    if (q?.trim()) {
      query = query.or(`email.ilike.%${q.trim()}%,first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`);
    }
    if (availability?.trim()) query = query.eq("availability", availability.trim());
    if (status === "locked") query = query.eq("is_locked", true);
    if (status === "active") query = query.eq("is_locked", false);

    const { data } = await query;
    const users = (data ?? []) as unknown as UserRow[];
    const hasFilter = !!(q || availability || status || sort || order);
    const params = { q, availability, status, sort, order, tab };
    const failedInviteEmails = await getFailedInviteEmails(
      supabase,
      users.map((u) => u.email).filter((e): e is string => !!e)
    );
    const tagsByUser = await getTagsByUserId(supabase, users.map((u) => u.id));

    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-balance text-zinc-900">Internal Users</h1>
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-zinc-700">{users.length}</span>
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
            aria-label="Search name or email"
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search name or email…"
                className="w-full sm:w-auto rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <select
                name="availability"
              aria-label="Filter by availability"
                defaultValue={availability ?? ""}
                className="min-w-0 flex-1 sm:flex-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="">All availability</option>
                <option value="available">Available</option>
                <option value="on_leave">On leave</option>
                <option value="at_capacity">At capacity</option>
              </select>
              <select
                name="status"
              aria-label="Filter by status"
                defaultValue={status ?? ""}
                className="min-w-0 flex-1 sm:flex-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="locked">Locked</option>
              </select>
              <button
                type="submit"
                className="press-subtle w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto"
              >
                Search
              </button>
              {hasFilter && (
                <Link
                  href="/admin/users?tab=consultants"
                  className="press-subtle w-full rounded-md border border-zinc-300 px-4 py-2 text-center text-sm text-zinc-600 hover:bg-zinc-100 sm:w-auto"
                >
                  Clear
                </Link>
              )}
            </div>
          </form>
        </div>

        {users.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
            {hasFilter ? "No consultants match your filters." : "No consultants yet. Create an account with the Consultant role to add one."}
          </div>
        ) : (
          <div className="space-y-2">
            <SortPills params={params} sortCol={sort && CONSULTANT_SORT_COLS.includes(sort as ConsultantSortCol) ? (sort as ConsultantSortCol) : "first_name"} sortOrder={sortOrder} options={CONSULTANT_SORT_OPTIONS} />
            <div className="overflow-hidden rounded-lg">
              {users.map((u) => (
                <Link
                  key={u.id}
                  href={`/admin/users/${u.id}`}
                  className={`flex items-center gap-3 border-l-[3px] border-y border-r border-zinc-200 bg-white px-3 py-2.5 transition-colors duration-150 hover:bg-zinc-50 focus-visible:relative focus-visible:z-10 ${
                    u.is_locked ? "border-l-red-400" : u.availability === "at_capacity" ? "border-l-amber-400" : "border-l-zinc-200"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium text-zinc-900">
                      {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
                    </span>
                    <p className="mt-0.5 truncate text-xs text-zinc-500">{u.email}</p>
                    <DisciplineChips disciplines={u.disciplines} className="mt-1" />
                    <TagChips tags={tagsByUser.get(u.id)} className="mt-1" />
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {u.email && failedInviteEmails.has(u.email) && (
                      <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Invite failed</span>
                    )}
                    {u.is_locked ? (
                      <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Locked</span>
                    ) : (
                      <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${AVAILABILITY_CLASSES[u.availability as ConsultantAvailability] ?? "bg-zinc-100 text-zinc-600"}`}>
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

  const sortOrder = orderParam ?? naturalOrder(sortCol);
  query = query.order(sortCol, { ascending: sortOrder === "asc" });

  query = query.neq("role", "stakeholder");

  if (q?.trim()) {
    query = query.or(`email.ilike.%${q.trim()}%,first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`);
  }
  if (role?.trim()) query = query.eq("role", role.trim());
  if (status === "locked") query = query.eq("is_locked", true);
  if (status === "active") query = query.eq("is_locked", false);

  const { data } = await query;
  const users = (data ?? []) as unknown as UserRow[];
  const hasFilter = !!(q || role || status || sort || order);
  const failedInviteEmails = await getFailedInviteEmails(
    supabase,
    users.map((u) => u.email).filter((e): e is string => !!e)
  );
  const tagsByUser = await getTagsByUserId(supabase, users.map((u) => u.id));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-balance text-zinc-900">Internal Users</h1>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-zinc-700">{users.length}</span>
        </div>
        <CreateAccountModal orgs={orgs} callerRole={caller.role as string} />
      </div>

      <TabBar tab={tab} />

      <form method="GET" className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            aria-label="Search name or email"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or email…"
            className="w-full sm:w-auto rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <select
            name="role"
              aria-label="Filter by role"
            defaultValue={role ?? ""}
            className="min-w-0 flex-1 sm:flex-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All roles</option>
            <option value="super_admin">Super Admin</option>
            <option value="admin">Admin</option>
            <option value="consultant">Consultant</option>
          </select>
          <select
            name="status"
              aria-label="Filter by status"
            defaultValue={status ?? ""}
            className="min-w-0 flex-1 sm:flex-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
          </select>
          <button
            type="submit"
            className="press-subtle w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/users"
              className="press-subtle w-full rounded-md border border-zinc-300 px-4 py-2 text-center text-sm text-zinc-600 hover:bg-zinc-100 sm:w-auto"
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
                className={`flex items-center gap-3 border-l-[3px] border-y border-r border-zinc-200 bg-white px-3 py-2.5 transition-colors duration-150 hover:bg-zinc-50 focus-visible:relative focus-visible:z-10 ${
                  u.is_locked ? "border-l-red-400" : u.role === "consultant" && u.availability === "at_capacity" ? "border-l-amber-400" : "border-l-zinc-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-zinc-900">
                    {u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email}
                  </span>
                  <p className="mt-0.5 truncate text-xs tabular-nums text-zinc-500">
                    {ROLE_LABELS[u.role] ?? u.role}{u.role === "stakeholder" && <> · {u.clients?.name ?? "—"}</>} · Joined {new Date(u.created_at).toLocaleDateString("en-AU")}
                  </p>
                  <DisciplineChips disciplines={u.disciplines} className="mt-1" />
                  <TagChips tags={tagsByUser.get(u.id)} className="mt-1" />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {u.email && failedInviteEmails.has(u.email) && (
                    <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Invite failed</span>
                  )}
                  {u.is_locked ? (
                    <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Locked</span>
                  ) : u.role === "consultant" ? (
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${AVAILABILITY_CLASSES[u.availability as ConsultantAvailability] ?? "bg-zinc-100 text-zinc-600"}`}>
                      {AVAILABILITY_LABELS[u.availability as ConsultantAvailability] ?? u.availability}
                    </span>
                  ) : (
                    <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
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
