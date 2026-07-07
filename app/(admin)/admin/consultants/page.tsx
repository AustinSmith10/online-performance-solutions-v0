import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { User, ConsultantAvailability } from "@/types";

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

const SORT_COLS = ["first_name", "email", "availability"] as const;
type SortCol = (typeof SORT_COLS)[number];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "first_name") === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/consultants?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">↕</span>;
  return <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>;
}

type ConsultantRow = Pick<User, "id" | "email" | "first_name" | "last_name" | "availability" | "is_locked"> & {
  clients: { name: string } | null;
};

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
    .select("id, email, first_name, last_name, availability, is_locked, clients(name)")
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
  const hasFilter = !!(q || availability || status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">Consultants</h1>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-blue-700">{consultants.length}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Availability state is set by each consultant from their workspace. Super Admins can also update it from the user detail page.
        </p>
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
              href="/admin/consultants"
              className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {consultants.length === 0 ? (
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
                    Name <SortIcon active={sortCol === "first_name"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Client</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "availability")} className="group inline-flex items-center hover:text-zinc-700">
                    Availability <SortIcon active={sortCol === "availability"} order={sortOrder} />
                  </a>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {consultants.map((c) => (
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
                  <td className="px-5 py-3">
                    {c.is_locked ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Locked</span>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${AVAILABILITY_CLASSES[c.availability]}`}>
                        {AVAILABILITY_LABELS[c.availability]}
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
