import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateCostUsd } from "@/lib/ai/pricing";

export interface AiUsageRow {
  feature: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** null when the model has no entry in lib/ai/pricing.ts */
  estimatedCostUsd: number | null;
}

export interface AiUsageSummary {
  rows: AiUsageRow[];
  totalCalls: number;
  totalEstimatedCostUsd: number;
  /** true if any row's model was unpriced, so the total is a lower bound */
  hasUnpricedModel: boolean;
}

export async function getAiUsageSummary(
  supabase: SupabaseClient,
  days: number
): Promise<AiUsageSummary> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("ai_usage_summary", { p_since: since });
  if (error) throw new Error(`ai_usage_summary failed: ${error.message}`);

  const rows: AiUsageRow[] = (data ?? []).map(
    (r: { feature: string; model: string; calls: number; input_tokens: number; output_tokens: number }) => {
      const inputTokens = Number(r.input_tokens);
      const outputTokens = Number(r.output_tokens);
      return {
        feature: r.feature,
        model: r.model,
        calls: Number(r.calls),
        inputTokens,
        outputTokens,
        estimatedCostUsd: estimateCostUsd(r.model, inputTokens, outputTokens),
      };
    }
  );

  return {
    rows,
    totalCalls: rows.reduce((n, r) => n + r.calls, 0),
    totalEstimatedCostUsd: rows.reduce((n, r) => n + (r.estimatedCostUsd ?? 0), 0),
    hasUnpricedModel: rows.some((r) => r.estimatedCostUsd === null),
  };
}
