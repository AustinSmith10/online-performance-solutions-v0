#!/usr/bin/env bash
# Release-phase migration step (#167). Wired in as ops-web's
# `preDeployCommand` in railway.toml — runs after build, before the new
# version serves traffic. Any failure exits non-zero and aborts the deploy;
# the previously-running version keeps serving.
#
# Required env (set in the ops-web Railway service variables):
#   SUPABASE_DB_URL   Direct Postgres connection string for the production
#                     database (Supabase dashboard → Project Settings →
#                     Database → Connection string → "Direct connection",
#                     port 5432 — NOT the transaction pooler on 6543, which
#                     can't run migrations).
#   DATABASE_URL      Accepted as a fallback if SUPABASE_DB_URL is unset — but
#                     only if it is a *direct* 5432 URL. ops-worker's
#                     DATABASE_URL may be a pooler URL; don't assume.
#
# This replaces the deleted, unwired scripts/migrate.ts and its parallel
# `_migrations` ledger — the Supabase CLI's own `supabase_migrations.
# schema_migrations` is the single source of truth for what's applied.

set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-${DATABASE_URL:-}}"
if [[ -z "$DB_URL" ]]; then
  echo "[apply-migrations] FATAL: neither SUPABASE_DB_URL nor DATABASE_URL is set — cannot apply migrations." >&2
  exit 1
fi

echo "[apply-migrations] applying pending migrations to production…"

# --include-all: apply every local migration not yet recorded remotely, in
# order, without the interactive confirmation prompt.
npx --yes supabase db push --db-url "$DB_URL" --include-all

echo "[apply-migrations] done — schema is up to date."
