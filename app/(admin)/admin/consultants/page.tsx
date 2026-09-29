import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { DisciplineChips } from "../users/_components/DisciplineChips";
import type { User, ConsultantAvailability } from "@/types";

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

const SORT_COLS = ["first_name", "email", "availability"] as const;
type SortCol = (typeof SORT_COLS)[number];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "first_name") === col;
  p.set("sort", col);
  // Active pill flips direction (default is ascending); a newly chosen one starts A→Z.
  p.set("order", isActive && params.order !== "desc" ? "desc" : "asc");
  return `/admin/consultants?${p.toString()}`;
}

const SORT_OPTIONS: { col: SortCol; label: string }[] = [
  { col: "first_name", label: "Name" },
  { col: "email", label: "Email" },
  { col: "availability", label: "Availability" },
];

function SortPills({
  params,
  sortCol,
  sortOrder,
}: {
  params: Record<string, string | undefined>;
  sortCol: SortCol;
  sortOrder: "asc" | "desc";
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-zinc-500">Sort:</span>
      {SORT_OPTIONS.map((o) => {
        const active = sortCol === o.col;
        return (
          <Link
            key={o.col}
            href={sortHref(params, o.col)}
            aria-current={active ? "true" : undefined}
            className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-150 ${
              active ? "bg-zinc-900 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-900"
            }`}
          >
            {o.label} {active ? (sortOrder === "asc" ? "↑" : "↓") : ""}
          </Link>
        );
      })}
    </div>
  );
}

type ConsultantRow = Pick<User, "id" | "email" | "first_name" | "last_name" | "availability" | "is_locked" | "disciplines">;

export default async function ConsultantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; availability?: string; status?: string; sort?: string; order?: string }>;
}) {
  const { q, availability, status, sort, order } = await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "first_name";
  const sortOrder: "asc" | "desc" = order === "desc" ? "desc" : "asc";
  const params = { q, availability, status, sort, order };

  const supabase = createAdminClient();
  let query = supabase
    .from("users")
    .select("id, email, first_name, last_name, availability, is_locked, disciplines")
    .eq("role", "consultant")
    .is("deleted_at", null)
    .order(sortCol, { ascending: sortOrder === "asc" });

  if (q?.trim()) {
    query = query.or(`email.ilike.%${q.trim()}%,first_name.ilike.%${q.trim()}%,last_name.ilike.%${q.trim()}%`);
  }
  if (availability?.trim()) query = query.eq("availability", availability.trim());
  if (status === "locked") query = query.eq("is_locked", true);
  if (status === "active") query = query.eq("is_locked", false);

  const { data } = await query;
  const consultants = (data ?? []) as unknown as ConsultantRow[];
  const hasFilter = !!(q || availability || status || sort || order);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-balance text-zinc-900">Consultants</h1>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-zinc-700">{consultants.length}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Availability state is set by each consultant from their workspace. Super Admins can also update it from the user detail page.
        </p>
      </div>

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
              href="/admin/consultants"
              className="press-subtle w-full rounded-md border border-zinc-300 px-4 py-2 text-center text-sm text-zinc-600 hover:bg-zinc-100 sm:w-auto"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {consultants.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No consultants match your filters." : "No consultants yet. Create an account with the Consultant role to add one."}
        </div>
      ) : (
        <div className="space-y-2">
          <SortPills params={params} sortCol={sortCol} sortOrder={sortOrder} />
          <div className="overflow-hidden rounded-lg">
            {consultants.map((c) => (
              <Link
                key={c.id}
                href={`/admin/users/${c.id}`}
                className={`flex items-center gap-3 border-l-[3px] border-y border-r border-zinc-200 bg-white px-3 py-2.5 transition-colors duration-150 hover:bg-zinc-50 focus-visible:relative focus-visible:z-10 ${
                  c.is_locked ? "border-l-red-400" : c.availability === "at_capacity" ? "border-l-amber-400" : "border-l-zinc-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-zinc-900">
                    {c.first_name && c.last_name ? `${c.first_name} ${c.last_name}` : c.email}
                  </span>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{c.email}</p>
                  <DisciplineChips disciplines={c.disciplines} className="mt-1" />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {c.is_locked ? (
                    <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Locked</span>
                  ) : (
                    <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${AVAILABILITY_CLASSES[c.availability]}`}>
                      {AVAILABILITY_LABELS[c.availability]}
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
