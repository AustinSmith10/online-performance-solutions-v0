import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminSuccessBanner } from "@/components/AdminSuccessBanner";
import { CreateOrgModal } from "./_components/CreateOrgModal";
import type { Client } from "@/types";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upfront: "Upfront",
  credit_deduction: "Credit Deduction",
  deferred: "Deferred",
};

const SORT_COLS = ["name", "credit_balance", "created_at"] as const;
type SortCol = (typeof SORT_COLS)[number];
const SORT_OPTIONS: { col: SortCol; label: string }[] = [
  { col: "name", label: "Name" },
  { col: "credit_balance", label: "Credit balance" },
  { col: "created_at", label: "Newest" },
];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "page") p.set(k, v);
  const isActive = (params.sort ?? "name") === col;
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

export default async function OrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; payment?: string; status?: string; sort?: string; order?: string; deleted?: string }>;
}) {
  const { name, payment, status, sort, order, deleted } = await searchParams;
  const showDeleted = deleted === "1";

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "name";
  const sortOrder: "asc" | "desc" = order === "desc" ? "desc" : "asc";
  const params = { name, payment, status, sort, order };

  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();
  let query = supabase
    .from("clients")
    .select("*")
    .is("deleted_at", null)
    .order(sortCol, { ascending: sortOrder === "asc" });

  if (name?.trim()) query = query.ilike("name", `%${name.trim()}%`);
  if (payment?.trim()) query = query.eq("payment_method", payment.trim());
  if (status === "frozen") query = query.eq("is_frozen", true);
  if (status === "active") query = query.eq("is_frozen", false);

  const { data: orgs } = await query;
  const rows = (orgs ?? []) as Client[];
  const hasFilter = name || payment || status;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {showDeleted && (
        <AdminSuccessBanner
          cleanUrl="/admin/clients"
          title="Client deleted"
          body="The client and its templates, stakeholders, and in-progress projects have been moved to the recovery bin."
        />
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">Clients</h1>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-blue-700">{rows.length}</span>
        </div>
        {actor.role === "super_admin" && <CreateOrgModal />}
      </div>

      <form method="GET" className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="name"
            defaultValue={name ?? ""}
            placeholder="Search by name…"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <select
            name="payment"
            defaultValue={payment ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All payment types</option>
            <option value="upfront">Upfront</option>
            <option value="credit_deduction">Credit Deduction</option>
            <option value="deferred">Deferred</option>
          </select>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="frozen">Frozen</option>
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

      {rows.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No clients match your filters." : "No clients yet."}
        </div>
      ) : (
        <div className="space-y-2">
          <SortPills params={params} sortCol={sortCol} sortOrder={sortOrder} />
          <div className="overflow-hidden rounded-lg">
            {rows.map((org) => (
              <Link
                key={org.id}
                href={`/admin/clients/${org.id}`}
                className={`flex items-center gap-3 border-l-4 border-y border-r border-zinc-200 bg-white px-3 py-2.5 hover:bg-zinc-50 ${
                  org.is_frozen ? "border-l-red-400" : "border-l-zinc-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-zinc-900">{org.name}</span>
                  <span className="ml-2 text-xs text-zinc-400">{org.slug}</span>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">
                    {PAYMENT_METHOD_LABELS[org.payment_method] ?? org.payment_method} · {org.state_territory ?? "—"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm tabular-nums text-zinc-600">{org.credit_balance.toLocaleString()}</span>
                  {org.is_frozen ? (
                    <span className="whitespace-nowrap rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-medium text-red-700">Frozen</span>
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
