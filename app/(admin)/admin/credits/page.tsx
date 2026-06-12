import { createAdminClient } from "@/lib/supabase/admin";
import { ClickableRow } from "@/components/ClickableRow";
import type { Organisation, PaymentMethod } from "@/types";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  upfront: "Upfront",
  credit_deduction: "Credit Deduction",
  deferred: "Deferred",
};

export default async function CreditsPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("organisations")
    .select("id, name, payment_method, credit_balance, deferred_balance, credit_limit, is_frozen")
    .order("name");

  const orgs = (data ?? []) as Pick<
    Organisation,
    "id" | "name" | "payment_method" | "credit_balance" | "deferred_balance" | "credit_limit" | "is_frozen"
  >[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Credits</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Credit balances and ledger across all organisations.
        </p>
      </div>

      {orgs.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
          No organisations yet.
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Organisation</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Payment</th>
                <th className="px-5 py-3 text-right font-medium text-zinc-500">Credit balance</th>
                <th className="px-5 py-3 text-right font-medium text-zinc-500">Deferred tab</th>
                <th className="px-5 py-3 text-left font-medium text-zinc-500">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-50">
              {orgs.map((org) => (
                <ClickableRow key={org.id} href={`/admin/credits/${org.id}`}>
                  <td className="px-5 py-3 font-medium text-zinc-900">{org.name}</td>
                  <td className="px-5 py-3 text-zinc-600">
                    {PAYMENT_LABELS[org.payment_method]}
                  </td>
                  <td className="px-5 py-3 text-right text-zinc-900">
                    {org.payment_method === "credit_deduction"
                      ? org.credit_balance.toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-5 py-3 text-right text-zinc-900">
                    {org.payment_method === "deferred" ? (
                      <span>
                        {org.deferred_balance.toLocaleString()}
                        {org.credit_limit > 0 && (
                          <span className="text-zinc-400"> / {org.credit_limit.toLocaleString()}</span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
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
