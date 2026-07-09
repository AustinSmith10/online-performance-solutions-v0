import { createAdminClient } from "@/lib/supabase/admin";

// Generalizes the hardcoded halcyon_developments mechanism in
// app/actions/submission.ts: an admin-configured client_metrics_table can be
// opted in (per issue #51) to auto-fill document fields at submission time —
// a match token's AI-extracted value is looked up against a match column,
// and matched output token values are filled in from that row instead of
// being sent to AI extraction.

export interface MetricsAutofillConfig {
  matchToken: string;
  matchColumnId: string;
  outputs: { outputToken: string; outputColumnId: string }[];
  rows: { data: Record<string, string | number | null> }[];
}

export async function getMetricsAutofillConfigs(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string
): Promise<MetricsAutofillConfig[]> {
  const { data: tables } = await supabase
    .from("client_metrics_tables")
    .select("id, match_token, match_column_id")
    .eq("client_id", clientId)
    .eq("autofill_enabled", true)
    .not("match_token", "is", null)
    .not("match_column_id", "is", null);

  const enabledTables = (tables ?? []) as {
    id: string;
    match_token: string;
    match_column_id: string;
  }[];
  if (enabledTables.length === 0) return [];

  const tableIds = enabledTables.map((t) => t.id);

  const [{ data: outputRows }, { data: rowData }] = await Promise.all([
    supabase
      .from("client_metrics_output_mappings")
      .select("table_id, output_token, output_column_id")
      .in("table_id", tableIds),
    supabase.from("client_metrics_rows").select("table_id, data").in("table_id", tableIds),
  ]);

  const outputsByTable = new Map<string, { outputToken: string; outputColumnId: string }[]>();
  for (const o of outputRows ?? []) {
    const list = outputsByTable.get(o.table_id as string) ?? [];
    list.push({ outputToken: o.output_token as string, outputColumnId: o.output_column_id as string });
    outputsByTable.set(o.table_id as string, list);
  }

  const rowsByTable = new Map<string, { data: Record<string, string | number | null> }[]>();
  for (const r of rowData ?? []) {
    const list = rowsByTable.get(r.table_id as string) ?? [];
    list.push({ data: r.data as Record<string, string | number | null> });
    rowsByTable.set(r.table_id as string, list);
  }

  return enabledTables
    .map((t) => ({
      matchToken: t.match_token,
      matchColumnId: t.match_column_id,
      outputs: outputsByTable.get(t.id) ?? [],
      rows: rowsByTable.get(t.id) ?? [],
    }))
    .filter((c) => c.outputs.length > 0);
}

// Output tokens must be excluded from the AI extraction call — mirrors the
// existing halcyonTokens exclusion-set pattern.
export function getAutofillExclusionTokens(configs: MetricsAutofillConfig[]): Set<string> {
  const tokens = new Set<string>();
  for (const config of configs) {
    for (const output of config.outputs) tokens.add(output.outputToken);
  }
  return tokens;
}

export interface MetricsPickRow {
  matchValue: string;
  outputs: Record<string, string>;
}

// Builds a client-facing pick list (match value -> output values) from
// whichever enabled config produces the given output token — used to let a
// stakeholder correct/confirm an auto-matched value (e.g. trustee) in the
// review UI, without the UI needing to know about the underlying table.
export function buildMetricsPickRows(
  configs: MetricsAutofillConfig[],
  forOutputToken: string
): { matchToken: string; rows: MetricsPickRow[] } | null {
  const config = configs.find((c) => c.outputs.some((o) => o.outputToken === forOutputToken));
  if (!config) return null;

  return {
    matchToken: config.matchToken,
    rows: config.rows.map((r) => ({
      matchValue: String(r.data[config.matchColumnId] ?? ""),
      outputs: Object.fromEntries(
        config.outputs.map((o) => [o.outputToken, String(r.data[o.outputColumnId] ?? "")])
      ),
    })),
  };
}

// Case-insensitive exact-then-substring match, mirroring today's dev_name
// matching logic. No match found is a graceful no-op — same as today.
export function resolveMetricsAutofill(
  configs: MetricsAutofillConfig[],
  fields: Record<string, { value: string; confidence: string }>
): void {
  for (const config of configs) {
    const matchValue = fields[config.matchToken]?.value?.trim() ?? "";
    if (!matchValue) continue;
    const needle = matchValue.toLowerCase();

    const cellText = (row: { data: Record<string, string | number | null> }) =>
      String(row.data[config.matchColumnId] ?? "").toLowerCase();

    const matchedRow =
      config.rows.find((r) => cellText(r) === needle) ??
      config.rows.find((r) => {
        const cell = cellText(r);
        return cell !== "" && (cell.includes(needle) || needle.includes(cell));
      });

    if (!matchedRow) continue;

    for (const output of config.outputs) {
      const cellValue = matchedRow.data[output.outputColumnId];
      if (cellValue === null || cellValue === undefined) continue;
      fields[output.outputToken] = { value: String(cellValue), confidence: "high" };
    }
  }
}
