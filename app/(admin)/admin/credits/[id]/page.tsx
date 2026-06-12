import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { TopUpForm } from "./_components/TopUpForm";
import { FreezeForm } from "./_components/FreezeForm";
import type { Organisation, CreditLedgerEntry, CreditEventType } from "@/types";

const EVENT_LABELS: Record<CreditEventType, string> = {
  top_up: "Top-up",
  deduction: "Deduction",
  deferred_debit: "Deferred debit",
  upfront_log: "Upfront log",
  override: "Override",
};

const EVENT_COLOURS: Record<CreditEventType, string> = {
  top_up: "text-green-700",
  deduction: "text-red-700",
  deferred_debit: "text-orange-700",
  upfront_log: "text-zinc-500",
  override: "text-yellow-700",
};

export default async function OrgCreditsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createAdminClient();

  const [{ data: org }, { data: ledger }] = await Promise.all([
    supabase
      .from("organisations")
      .select("id, name, payment_method, credit_balance, deferred_balance, credit_limit, is_frozen")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("credit_ledger")
      .select("*")
      .eq("org_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  if (!org) notFound();

  const orgData = org as Pick<
    Organisation,
    "id" | "name" | "payment_method" | "credit_balance" | "deferred_balance" | "credit_limit" | "is_frozen"
  >;
  const entries = (ledger ?? []) as CreditLedgerEntry[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/admin/credits" className="text-sm text-zinc-500 hover:text-zinc-700">
          ← Credits
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-900">{orgData.name}</h1>
          {orgData.is_frozen && (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Frozen
            </span>
          )}
        </div>
      </div>

      {/* Balance cards */}
      <div className="grid grid-cols-2 gap-4">
        {orgData.payment_method === "credit_deduction" && (
          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Credit balance
            </p>
            <p className="mt-1 text-3xl font-semibold text-zinc-900">
              {orgData.credit_balance.toLocaleString()}
            </p>
          </div>
        )}
        {orgData.payment_method === "deferred" && (
          <>
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Deferred tab
              </p>
              <p className="mt-1 text-3xl font-semibold text-zinc-900">
                {orgData.deferred_balance.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Credit limit
              </p>
              <p className="mt-1 text-3xl font-semibold text-zinc-900">
                {orgData.credit_limit > 0 ? orgData.credit_limit.toLocaleString() : "None"}
              </p>
            </div>
          </>
        )}
        {orgData.payment_method === "upfront" && (
          <div className="col-span-2 rounded-lg border border-zinc-200 bg-zinc-50 p-5">
            <p className="text-sm text-zinc-500">
              This organisation uses upfront payment — no credit balance managed in OPS.
            </p>
          </div>
        )}
      </div>

      {/* Top-up — credit_deduction orgs only */}
      {orgData.payment_method === "credit_deduction" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-semibold text-zinc-900">Add credits</h2>
          <TopUpForm orgId={orgData.id} />
        </div>
      )}

      {/* Freeze / unfreeze — deferred orgs only */}
      {orgData.payment_method === "deferred" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-zinc-900">Account freeze</h2>
          <p className="mb-3 text-sm text-zinc-500">
            {orgData.is_frozen
              ? "This account is frozen. Deferred dispatch is blocked until unfrozen."
              : "Freeze this account to immediately block all deferred dispatch."}
          </p>
          <FreezeForm orgId={orgData.id} isFrozen={orgData.is_frozen} />
        </div>
      )}

      {/* Ledger history */}
      <div className="rounded-lg border border-zinc-200 bg-white">
        <div className="border-b border-zinc-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-zinc-900">Ledger history</h2>
          <p className="mt-0.5 text-xs text-zinc-500">Last 50 entries — immutable</p>
        </div>

        {entries.length === 0 ? (
          <p className="px-5 py-4 text-sm text-zinc-400">No ledger entries yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Date</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Event</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">Amount</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">Balance after</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 text-xs text-zinc-500">
                    {new Date(entry.created_at).toLocaleString("en-AU", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className={`px-4 py-3 font-medium ${EVENT_COLOURS[entry.event_type]}`}>
                    {EVENT_LABELS[entry.event_type]}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        entry.amount > 0
                          ? "text-green-700"
                          : entry.amount < 0
                          ? "text-red-700"
                          : "text-zinc-400"
                      }
                    >
                      {entry.amount > 0 ? `+${entry.amount}` : entry.amount === 0 ? "—" : entry.amount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-900">{entry.balance_after}</td>
                  <td className="px-4 py-3 text-zinc-500">{entry.notes ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
