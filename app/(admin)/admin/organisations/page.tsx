import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { Organisation } from "@/types";

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upfront: "Upfront",
  credit_deduction: "Credit Deduction",
  deferred: "Deferred",
};

export default async function OrganisationsPage() {
  const supabase = createAdminClient();
  const { data: orgs } = await supabase
    .from("organisations")
    .select("*")
    .order("created_at", { ascending: false });

  const rows = (orgs ?? []) as Organisation[];

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

      {rows.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No organisations yet.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Name</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Payment</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">State</th>
                <th className="px-5 py-3 text-right font-medium text-zinc-500">Credit balance</th>
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
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                        Frozen
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Active
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
