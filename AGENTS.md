<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Database migrations — expand/contract (see docs/adr/0001)

Migrations apply automatically in the deploy release phase (`railway.toml` →
`scripts/deploy/apply-migrations.sh`), **before** the new app version serves.
There is always a window where old code runs against the new schema (and, on
rollback, new code against the old schema), so **every migration must leave
the currently-running app version working.**

- **Expand now** (safe ahead of code): add a nullable column, add a table or
  index, add a `CHECK ... NOT VALID`, add an enum value, backfill.
- **Contract later** (separate migration, later deploy, only once the code
  that stopped using the old shape is fully live): drop a column/table,
  add `NOT NULL`, `VALIDATE CONSTRAINT`, rename (= drop + add, never in
  place).

A new migration is one PR containing three things:

1. the `NNNNNNNNNNNN_name.sql` file (next number after the highest in
   `supabase/migrations/`);
2. the bumped `EXPECTED_SCHEMA_MIGRATION` in `lib/schema/expected-migration.ts`
   (the boot-time drift guard refuses to serve if the DB is behind this);
3. regenerated `types/supabase.ts` (`npm run db:generate` against a fresh
   local DB — CI fails the PR if it's left stale).

Do **not** add a new migrator or migration ledger — `supabase db push` and
`supabase_migrations.schema_migrations` are the only mechanism. The old
`scripts/migrate.ts` was deleted for competing with it.
