import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Client, PaymentMethod } from "@/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  upfront: "Upfront",
  credit_deduction: "Credit Deduction",
  deferred: "Deferred",
};

const SORT_COLS = ["name", "credit_balance", "deferred_balance"] as const;
type SortCol = (typeof SORT_COLS)[number];
const SORT_OPTIONS: { col: SortCol; label: string }[] = [
  { col: "name", label: "Client" },
  { col: "credit_balance", label: "Credit balance" },
  { col: "deferred_balance", label: "Deferred tab" },
];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "name") === col;
  p.set("sort", col);
  // Active pill flips direction (default is ascending); a newly chosen one starts in its
  // natural direction: names A→Z, balances highest first.
  p.set("order", isActive ? (params.order === "desc" ? "asc" : "desc") : col === "name" ? "asc" : "desc");
  return `/admin/credits?${p.toString()}`;
}

function SortPills({ params, sortCol, sortOrder }: { params: Record<string, string | undefined>; sortCol: SortCol; sortOrder: "asc" | "desc" }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-zinc-500">Sort:</span>
      {SORT_OPTIONS.map((o) => {
        const active = sortCol === o.col;
        return (
          <a
            key={o.col}
            href={sortHref(params, o.col)}
            aria-current={active ? "true" : undefined}
            className={`rounded-full px-2 py-0.5 text-xs font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:inline-flex [@media(pointer:coarse)]:min-h-10 [@media(pointer:coarse)]:items-center [@media(pointer:coarse)]:px-3 ${
              active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900"
            }`}
          >
            {o.label} {active ? (sortOrder === "asc" ? "↑" : "↓") : ""}
          </a>
        );
      })}
    </div>
  );
}

type OrgRow = Pick<Client, "id" | "name" | "payment_method" | "credit_balance" | "deferred_balance" | "credit_limit" | "is_frozen">;

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; payment?: string; status?: string; sort?: string; order?: string }>;
}) {
  const { q, payment, status, sort, order } = await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "name";
  const sortOrder: "asc" | "desc" = order === "desc" ? "desc" : "asc";
  const params = { q, payment, status, sort, order };

  const supabase = createAdminClient();
  let query = supabase
    .from("clients")
    .select("id, name, payment_method, credit_balance, deferred_balance, credit_limit, is_frozen")
    .is("deleted_at", null)
    .order(sortCol, { ascending: sortOrder === "asc" });

  if (q?.trim()) query = query.ilike("name", `%${q.trim()}%`);
  if (payment?.trim()) query = query.eq("payment_method", payment.trim());
  if (status === "frozen") query = query.eq("is_frozen", true);
  if (status === "active") query = query.eq("is_frozen", false);

  const { data } = await query;
  const orgs = (data ?? []) as OrgRow[];
  const hasFilter = !!(q || payment || status || sort || order);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">Credits</h1>
          <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-zinc-700">{orgs.length}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">Credit balances and ledger across all clients.</p>
      </div>

      <form method="GET" className="rounded-xl border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            aria-label="Search client"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search client…"
            className="w-full sm:w-auto rounded-md border border-zinc-300 px-3 py-2 text-sm placeholder-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          />
          <select
            name="payment"
            aria-label="Filter by payment type"
            defaultValue={payment ?? ""}
            className="min-w-0 flex-1 sm:flex-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All payment types</option>
            <option value="upfront">Upfront</option>
            <option value="credit_deduction">Credit Deduction</option>
            <option value="deferred">Deferred</option>
          </select>
          <select
            name="status"
            aria-label="Filter by status"
            defaultValue={status ?? ""}
            className="min-w-0 flex-1 sm:flex-none rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="frozen">Frozen</option>
          </select>
          <button
            type="submit"
            className="press-subtle w-full rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/credits"
              className="press-subtle w-full rounded-md border border-zinc-300 px-4 py-2 text-center text-sm text-zinc-600 hover:bg-zinc-100 sm:w-auto"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {orgs.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No clients match your filters." : "No clients yet."}
        </div>
      ) : (
        <div className="space-y-2">
          <SortPills params={params} sortCol={sortCol} sortOrder={sortOrder} />
          <div className="overflow-hidden rounded-lg">
            {orgs.map((org) => (
              <Link
                key={org.id}
                href={`/admin/credits/${org.id}`}
                className={`flex items-center gap-3 border-l-[3px] border-y border-r border-zinc-200 bg-white px-3 py-2.5 transition-colors duration-150 hover:bg-zinc-50 focus-visible:relative focus-visible:z-10 ${
                  org.is_frozen ? "border-l-red-400" : "border-l-zinc-200"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm font-medium text-zinc-900">{org.name}</span>
                  <p className="mt-0.5 truncate text-xs text-zinc-500">{PAYMENT_LABELS[org.payment_method]}</p>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-right">
                  <div className="text-xs">
                    <p className="text-zinc-500">Credit</p>
                    <p className="tabular-nums text-zinc-900">
                      {org.payment_method === "credit_deduction" ? org.credit_balance.toLocaleString() : "—"}
                    </p>
                  </div>
                  <div className="text-xs">
                    <p className="text-zinc-500">Deferred</p>
                    <p className="tabular-nums text-zinc-900">
                      {org.payment_method === "deferred" ? (
                        <>
                          {org.deferred_balance.toLocaleString()}
                          {org.credit_limit > 0 && <span className="text-zinc-500"> / {org.credit_limit.toLocaleString()}</span>}
                        </>
                      ) : "—"}
                    </p>
                  </div>
                  {org.is_frozen ? (
                    <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Frozen</span>
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
