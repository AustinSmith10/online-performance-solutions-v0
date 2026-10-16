// Real-Postgres guard for the build-audit CRITICAL fixed by migration 143:
// SECURITY DEFINER functions must not be executable by anon/authenticated
// (Supabase's default privileges grant them directly, so REVOKE ... FROM PUBLIC
// alone is not enough), and no public table may be without RLS.
//
// Needs `npx supabase start` with migrations applied; run via
// `npm run test:concurrency` (CI job "Ledger concurrency").
import { describe, it, expect, afterAll } from "vitest";
import { Client } from "pg";

const DB_URL =
  process.env.SUPABASE_TEST_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// Definer functions RLS policies evaluate as the querying role. Anything added
// here must be a pure, side-effect-free helper — never a mutating RPC.
const AUTHENTICATED_ALLOWLIST = new Set(["consultant_owns_project"]);

const client = new Client({ connectionString: DB_URL });
const ready = client.connect();

afterAll(async () => {
  await ready.catch(() => {});
  await client.end().catch(() => {});
});

describe("database grants", () => {
  it("SECURITY DEFINER functions are not executable by anon", async () => {
    await ready;
    const { rows } = await client.query(
      `SELECT p.oid::regprocedure::text AS sig
         FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
          AND has_function_privilege('anon', p.oid, 'EXECUTE')`
    );
    expect(rows.map((r) => r.sig)).toEqual([]);
  });

  it("SECURITY DEFINER functions are not executable by authenticated, except allowlisted RLS helpers", async () => {
    await ready;
    const { rows } = await client.query(
      `SELECT p.proname, p.oid::regprocedure::text AS sig
         FROM pg_proc p
        WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
          AND has_function_privilege('authenticated', p.oid, 'EXECUTE')`
    );
    const offenders = rows.filter((r) => !AUTHENTICATED_ALLOWLIST.has(r.proname)).map((r) => r.sig);
    expect(offenders).toEqual([]);
  });

  it("every public table has row level security enabled", async () => {
    await ready;
    const { rows } = await client.query(
      `SELECT c.relname
         FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r' AND NOT c.relrowsecurity`
    );
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});
