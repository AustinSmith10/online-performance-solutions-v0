import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { EXPECTED_SCHEMA_MIGRATION } from "./expected-migration";

export interface SchemaDriftResult {
  ok: boolean;
  expected: string;
  actual: string | null;
  reason?: string;
}

/**
 * Compares the latest migration this build ships (EXPECTED_SCHEMA_MIGRATION)
 * against the latest migration actually applied to the remote database
 * (`latest_schema_migration()` RPC — see migration
 * 00000000000132). "Behind" = the DB's high-water mark sorts lower than the
 * build's.
 *
 * Deliberately fail-CLOSED on a "behind" verdict (that's the #166 outage this
 * exists to stop) but fail-OPEN on an inconclusive check — if the RPC itself
 * errors (e.g. it hasn't been deployed yet on the very first rollout), we log
 * and return ok:true rather than bricking every deploy on a transient DB
 * blip. The readiness endpoint's existing DB ping already covers hard DB
 * outages.
 */
export async function checkSchemaDrift(
  supabase: SupabaseClient
): Promise<SchemaDriftResult> {
  const expected = EXPECTED_SCHEMA_MIGRATION;

  let actual: string | null = null;
  try {
    const { data, error } = await supabase.rpc("latest_schema_migration");
    if (error) {
      console.error("[schema-drift] latest_schema_migration RPC failed:", error);
      return { ok: true, expected, actual: null, reason: `RPC error: ${error.message}` };
    }
    actual = (data as string | null) ?? null;
  } catch (err) {
    console.error("[schema-drift] latest_schema_migration RPC threw:", err);
    return { ok: true, expected, actual: null, reason: "RPC threw" };
  }

  if (actual === null) {
    return { ok: true, expected, actual: null, reason: "no migrations recorded on remote" };
  }

  // Numeric-prefix strings are zero-padded and equal length, so a plain
  // string compare is a correct version ordering.
  if (actual < expected) {
    return {
      ok: false,
      expected,
      actual,
      reason: `database schema is behind: remote is at ${actual}, this build expects ${expected}`,
    };
  }

  return { ok: true, expected, actual };
}

/**
 * Boot-time gate for ops-worker: refuses to start against a stale schema.
 * Exits the process (Railway's ON_FAILURE policy then keeps the previous
 * version running and the deploy stays red).
 */
export async function assertSchemaCurrentOrExit(supabase: SupabaseClient): Promise<void> {
  const result = await checkSchemaDrift(supabase);
  if (!result.ok) {
    console.error(`[schema-drift] FATAL — ${result.reason}. Refusing to start.`);
    process.exit(1);
  }
  if (result.actual) {
    console.log(`[schema-drift] ok — remote at ${result.actual}, build expects ${result.expected}`);
  }
}
