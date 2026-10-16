import type { AiUsageSummary } from "@/lib/ai/usage-summary";

function UsageTable({ title, summary }: { title: string; summary: AiUsageSummary }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
        <p className="tabular-nums text-sm text-zinc-700">
          {summary.totalCalls.toLocaleString()} calls · ≈ US${summary.totalEstimatedCostUsd.toFixed(2)}
          {summary.hasUnpricedModel ? "+" : ""}
        </p>
      </div>
      {summary.rows.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">No AI calls recorded in this period.</p>
      ) : (
        <table className="mt-3 w-full text-left text-xs">
          <thead className="text-zinc-500">
            <tr>
              <th className="py-1 font-medium">Feature</th>
              <th className="py-1 font-medium">Model</th>
              <th className="py-1 text-right font-medium">Calls</th>
              <th className="py-1 text-right font-medium">Input tokens</th>
              <th className="py-1 text-right font-medium">Output tokens</th>
              <th className="py-1 text-right font-medium">Est. cost</th>
            </tr>
          </thead>
          <tbody className="tabular-nums text-zinc-800">
            {summary.rows.map((r) => (
              <tr key={`${r.feature}|${r.model}`} className="border-t border-zinc-100">
                <td className="py-1.5">{r.feature}</td>
                <td className="py-1.5 text-zinc-500">{r.model}</td>
                <td className="py-1.5 text-right">{r.calls.toLocaleString()}</td>
                <td className="py-1.5 text-right">{r.inputTokens.toLocaleString()}</td>
                <td className="py-1.5 text-right">{r.outputTokens.toLocaleString()}</td>
                <td className="py-1.5 text-right">
                  {r.estimatedCostUsd === null ? "—" : `US$${r.estimatedCostUsd.toFixed(3)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AiUsagePanel({ last7, last30 }: { last7: AiUsageSummary; last30: AiUsageSummary }) {
  return (
    <>
      <UsageTable title="Last 7 days" summary={last7} />
      <UsageTable title="Last 30 days" summary={last30} />
      <p className="text-xs text-zinc-500">
        Estimates use Anthropic&apos;s published per-token prices (lib/ai/pricing.ts) and ignore any
        discounts or credits — check the Anthropic console for the billed amount.
      </p>
    </>
  );
}
