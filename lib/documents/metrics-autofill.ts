import type { createAdminClient } from "@/lib/supabase/admin";

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

// ─── Development-name matching (#189) ───────────────────────────────────────
// The one shared matcher for keying an extracted/entered development name
// against a client metrics table's match column — used server-side by
// resolveMetricsAutofill and client-side for the trustee dropdown's default.
// Pure (no server-only imports) so the submission form can call it directly.

/** Case, dash-variant (-, –, —) and whitespace-insensitive form of a name. */
export function normalizeDevelopmentName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212-]/g, " - ")
    .replace(/\s+/g, " ")
    .trim();
}

export type DevelopmentNameMatch =
  | { status: "matched"; name: string; via: "exact" | "prefix" }
  | { status: "none" }
  | { status: "ambiguous"; names: string[] };

/**
 * Exact (normalized) match first; otherwise the longest table name that is a
 * whole-word prefix of the extracted name — "Halcyon Promenade – West" →
 * "Halcyon Promenade", since a trailing "West"/"Stage 2" never denotes a
 * different development with different values. No match, or a tie between
 * equally-long candidates, is unresolved rather than guessed.
 */
export function matchDevelopmentName(extracted: string, names: string[]): DevelopmentNameMatch {
  const needle = normalizeDevelopmentName(extracted);
  if (!needle) return { status: "none" };

  const candidates = names
    .map((name) => ({ name, norm: normalizeDevelopmentName(name) }))
    .filter((c) => c.norm !== "");

  const exact = candidates.filter((c) => c.norm === needle);
  if (exact.length === 1) return { status: "matched", name: exact[0].name, via: "exact" };
  if (exact.length > 1) return { status: "ambiguous", names: exact.map((c) => c.name) };

  const prefixes = candidates.filter((c) => needle.startsWith(`${c.norm} `));
  if (prefixes.length === 0) return { status: "none" };
  const longest = Math.max(...prefixes.map((c) => c.norm.length));
  const best = prefixes.filter((c) => c.norm.length === longest);
  if (best.length > 1) return { status: "ambiguous", names: best.map((c) => c.name) };
  return { status: "matched", name: best[0].name, via: "prefix" };
}

function words(value: string): Set<string> {
  return new Set(
    normalizeDevelopmentName(value)
      .split(" ")
      .filter((w) => w !== "" && w !== "-")
  );
}

/**
 * Closest table name by word overlap (Jaccard) — a *suggestion* only, for a
 * reviewer to confirm when matchDevelopmentName couldn't resolve. Never
 * applied automatically. Null when nothing shares a single word.
 */
export function suggestDevelopmentName(extracted: string, names: string[]): string | null {
  const target = words(extracted);
  if (target.size === 0) return null;
  let best: { name: string; score: number } | null = null;
  for (const name of names) {
    const candidate = words(name);
    if (candidate.size === 0) continue;
    const shared = [...candidate].filter((w) => target.has(w)).length;
    if (shared === 0) continue;
    const score = shared / new Set([...candidate, ...target]).size;
    if (!best || score > best.score) best = { name, score };
  }
  return best?.name ?? null;
}

/** The table row a development name resolves to, via matchDevelopmentName. */
export function findMetricsRow(
  config: MetricsAutofillConfig,
  matchValue: string
): { data: Record<string, string | number | null> } | null {
  const cell = (row: { data: Record<string, string | number | null> }) =>
    String(row.data[config.matchColumnId] ?? "");
  const result = matchDevelopmentName(matchValue, config.rows.map(cell));
  if (result.status !== "matched") return null;
  return config.rows.find((r) => cell(r) === result.name) ?? null;
}

// No match found (or an ambiguous one) is a graceful no-op — the output
// tokens are simply left unset.
export function resolveMetricsAutofill(
  configs: MetricsAutofillConfig[],
  fields: Record<string, { value: string; confidence: string }>
): void {
  for (const config of configs) {
    const matchValue = fields[config.matchToken]?.value?.trim() ?? "";
    if (!matchValue) continue;

    const matchedRow = findMetricsRow(config, matchValue);
    if (!matchedRow) continue;

    for (const output of config.outputs) {
      const cellValue = matchedRow.data[output.outputColumnId];
      if (cellValue === null || cellValue === undefined) continue;
      fields[output.outputToken] = { value: String(cellValue), confidence: "high" };
    }
  }
}
