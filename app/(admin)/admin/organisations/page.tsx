import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { Organisation } from "@/types";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upfront: "Upfront",
  credit_deduction: "Credit Deduction",
  deferred: "Deferred",
};

const SORT_COLS = ["name", "credit_balance", "created_at"] as const;
type SortCol = (typeof SORT_COLS)[number];

function sortHref(params: Record<string, string | undefined>, col: SortCol): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v && k !== "page") p.set(k, v);
  const isActive = (params.sort ?? "name") === col;
  p.set("sort", col);
  p.set("order", isActive && params.order !== "asc" ? "asc" : "desc");
  return `/admin/organisations?${p.toString()}`;
}

function SortIcon({ active, order }: { active: boolean; order: "asc" | "desc" }) {
  if (!active) return <span className="ml-1 text-zinc-300 group-hover:text-zinc-400">↕</span>;
  return <span className="ml-1 text-zinc-600">{order === "asc" ? "↑" : "↓"}</span>;
}

export default async function OrganisationsPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; payment?: string; status?: string; sort?: string; order?: string }>;
}) {
  const { name, payment, status, sort, order } = await searchParams;

  const sortCol: SortCol = SORT_COLS.includes(sort as SortCol) ? (sort as SortCol) : "name";
  const sortOrder: "asc" | "desc" = order === "desc" ? "desc" : "asc";
  const params = { name, payment, status, sort, order };

  const supabase = createAdminClient();
  let query = supabase
    .from("organisations")
    .select("*")
    .order(sortCol, { ascending: sortOrder === "asc" });

  if (name?.trim()) query = query.ilike("name", `%${name.trim()}%`);
  if (payment?.trim()) query = query.eq("payment_method", payment.trim());
  if (status === "frozen") query = query.eq("is_frozen", true);
  if (status === "active") query = query.eq("is_frozen", false);

  const { data: orgs } = await query;
  const rows = (orgs ?? []) as Organisation[];
  const hasFilter = name || payment || status;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Organisations</h1>
        <Link
          href="/admin/organisations/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          + New organisation
        </Link>
      </div>

      <form method="GET" className="rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            name="name"
            defaultValue={name ?? ""}
            placeholder="Search by name…"
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
              href="/admin/organisations"
              className="rounded border border-zinc-300 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-100"
            >
              Clear
            </Link>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          {hasFilter ? "No organisations match your filters." : "No organisations yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">
                  <a href={sortHref(params, "name")} className="group inline-flex items-center hover:text-zinc-700">
                    Name <SortIcon active={sortCol === "name"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Payment</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">State</th>
                <th className="px-5 py-3 text-right font-medium text-zinc-500">
                  <a href={sortHref(params, "credit_balance")} className="group inline-flex items-center justify-end hover:text-zinc-700">
                    Credit balance <SortIcon active={sortCol === "credit_balance"} order={sortOrder} />
                  </a>
                </th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {rows.map((org) => (
                <ClickableRow key={org.id} href={`/admin/organisations/${org.id}`}>
                  <td className="px-5 py-3">
                    <span className="font-medium text-zinc-900">{org.name}</span>
                    <span className="ml-2 text-xs text-zinc-400">{org.slug}</span>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">
                    {PAYMENT_METHOD_LABELS[org.payment_method] ?? org.payment_method}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{org.state_territory ?? "—"}</td>
                  <td className="px-5 py-3 text-right text-zinc-600">
                    {org.credit_balance.toLocaleString()}
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
          <p className="px-5 py-3 text-xs text-zinc-400">{rows.length} organisation{rows.length !== 1 ? "s" : ""}</p>
        </div>
      )}
    </div>
  );
}
