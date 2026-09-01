#!/usr/bin/env bash
# Release-phase migration step (#167). Wired in as ops-web's
# `preDeployCommand` in railway.toml — runs after build, before the new
# version serves traffic. Any failure exits non-zero and aborts the deploy;
# the previously-running version keeps serving.
#
# Required env (set in the ops-web Railway service variables):
#   SUPABASE_DB_URL   Postgres connection string for the production database
#                     (Supabase dashboard → Settings → Database → Connection
#                     string → URI, "Use connection pooling" OFF).
#
# This replaces the deleted, unwired scripts/migrate.ts and its parallel
# `_migrations` ledger — the Supabase CLI's own `supabase_migrations.
# schema_migrations` is the single source of truth for what's applied.

set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "[apply-migrations] FATAL: SUPABASE_DB_URL is not set — cannot apply migrations." >&2
  exit 1
fi

echo "[apply-migrations] applying pending migrations to production…"

# --include-all: apply every local migration not yet recorded remotely, in
# order, without the interactive confirmation prompt.
npx --yes supabase db push --db-url "$SUPABASE_DB_URL" --include-all

echo "[apply-migrations] done — schema is up to date."
