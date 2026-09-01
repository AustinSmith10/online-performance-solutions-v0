# ADR 0001 — Migrations are wired into deploy, and must be expand/contract

**Status:** Accepted (2026-08-31)
**Issue:** #167 (parent #166)

## Context

Migrations `123`–`127` shipped as **code** in commit `26d98c7` but their
**schema** was never applied to production — the Railway deploy ran only
`npm run build` then `npm start`, with no migration step. `stakeholder_reviews.
token_hash` didn't exist for ~3 weeks, so every dispatch write and every
`/approve/[token]` lookup failed with `PGRST204`. The error was swallowed
(`.error` unchecked), so the project still flipped to `dispatched` and emails
still sent — the stakeholder review + approval + token subsystem was silently
down.

Two failures compounded:

1. **No automated migration step.** Schema drift depended on someone
   remembering to run it by hand.
2. **The same commit shipped the additive column and the code that reads
   and writes it.** Even with an automated step there is always a window
   between "migration applied" and "new code live" (and the reverse on
   rollback) where the *other* version of the code is running against the
   *other* schema.

## Decision

### 1. Migrations apply automatically, before the new version serves

`railway.toml` gives **ops-web** a `preDeployCommand`
(`scripts/deploy/apply-migrations.sh` → `supabase db push`). It runs after
build, before traffic cuts over, and a non-zero exit aborts the deploy — the
previous version keeps serving. `scripts/migrate.ts` (an unwired, parallel
`_migrations` ledger) is deleted; `supabase_migrations.schema_migrations` is
the only source of truth.

### 2. The app refuses to run against a schema older than it expects

`lib/schema/expected-migration.ts` pins `EXPECTED_SCHEMA_MIGRATION` to the
highest migration filename prefix the build ships. On boot / healthcheck the
drift guard (`lib/schema/drift-guard.ts`) compares it against
`latest_schema_migration()` on the remote:

- **ops-web** — `/api/health` returns `503 { schema: "behind" }`, so a deploy
  that ships code ahead of its schema goes immediately red.
- **ops-worker** — `assertSchemaCurrentOrExit` exits the process before
  `pg-boss` starts.

This covers deploys that bypass the release step, and turns a silent
`PGRST204` into a visible failed deploy. It is fail-**closed** on a "behind"
verdict, fail-**open** on an inconclusive check (RPC error / not yet
deployed).

### 3. Every migration must be expand/contract

Because there is always a window where old code runs against new schema (and
new code against old schema, on rollback), **each migration must leave the
currently-running app version working.**

- **Expand** (safe to deploy ahead of code): add a nullable column, add a
  table, add an index, add a permissive CHECK as `NOT VALID`, add a new enum
  value, backfill.
- **Contract** (only *after* the code that stopped using the old shape is
  fully live, as a **separate** migration in a **later** deploy): drop a
  column, drop a table, tighten NOT NULL, `VALIDATE CONSTRAINT`, rename.

A rename is drop + add — never rename in place. A column the new code
requires is added nullable now; made `NOT NULL` in a follow-up once every
running version writes it.

Commit `26d98c7` violated this: it shipped the `token_hash` read/write switch
in the same commit as the additive column.

### 4. CI catches "code references a column no migration creates"

`.github/workflows/ci.yml` applies all migrations to a throwaway Postgres,
runs `npm run db:generate`, and fails the PR if `types/supabase.ts` is left
dirty — or if `EXPECTED_SCHEMA_MIGRATION` doesn't match the latest migration
file.

## Consequences

- A new migration is a three-part change in one PR: the `.sql` file, the
  bumped `EXPECTED_SCHEMA_MIGRATION`, and regenerated `types/supabase.ts`.
- Destructive changes take two deploys (expand, then contract). This is the
  point, not friction to route around.
- The production DB connection string (`SUPABASE_DB_URL`) must exist in the
  ops-web Railway service for the release step to work.
