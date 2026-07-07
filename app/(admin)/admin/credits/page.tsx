import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { Client, PaymentMethod } from "@/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  upfront: "Upfront",
  credit_deduction: "Credit Deduction",
  deferred: "Deferred",
};

const SORT_COLS = ["name", "credit_balance", "deferred_balance"] as const;
type SortCol = (typeof SORT_COLS)[number];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const isActive = (params.sort ?? "name") === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/credits?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">↕</span>;
  return <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>;
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
  const hasFilter = !!(q || payment || status);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">Credits</h1>
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-sm font-medium tabular-nums text-blue-700">{orgs.length}</span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">Credit balances and ledger across all clients.</p>
      </div>

      <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search organisation…"
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          />
          <select
            name="payment"
            defaultValue={payment ?? ""}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            <option value="">All payment types</option>
            <option value="upfront">Upfront</option>
            <option value="credit_deduction">Credit Deduction</option>
            <option value="deferred">Deferred</option>
          </select>
          <select
            name="status"
            defaultValue={status ?? ""}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-400"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="frozen">Frozen</option>
          </select>
          <button
            type="submit"
            className="rounded bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700"
          >
            Search
          </button>
          {hasFilter && (
            <Link
              href="/admin/credits"
              className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {orgs.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No clients match your filters." : "No clients yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[540px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "name")} className="group inline-flex items-center hover:text-zinc-700">
                    Client <SortIcon active={sortCol === "name"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Payment</th>
                <th className="px-5 py-3 text-right font-medium text-zinc-500">
                  <a href={sortHref(params, "credit_balance")} className="group inline-flex items-center justify-end hover:text-zinc-700">
                    Credit balance <SortIcon active={sortCol === "credit_balance"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-right font-medium text-zinc-500">
                  <a href={sortHref(params, "deferred_balance")} className="group inline-flex items-center justify-end hover:text-zinc-700">
                    Deferred tab <SortIcon active={sortCol === "deferred_balance"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {orgs.map((org) => (
                <ClickableRow key={org.id} href={`/admin/credits/${org.id}`}>
                  <td className="px-5 py-3 font-medium text-zinc-900">{org.name}</td>
                  <td className="px-5 py-3 text-zinc-600">{PAYMENT_LABELS[org.payment_method]}</td>
                  <td className="px-5 py-3 text-right text-zinc-900">
                    {org.payment_method === "credit_deduction" ? org.credit_balance.toLocaleString() : "—"}
                  </td>
                  <td className="px-5 py-3 text-right text-zinc-900">
                    {org.payment_method === "deferred" ? (
                      <span>
                        {org.deferred_balance.toLocaleString()}
                        {org.credit_limit > 0 && (
                          <span className="text-zinc-400"> / {org.credit_limit.toLocaleString()}</span>
                        )}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-5 py-3">
                    {org.is_frozen ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Frozen</span>
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
