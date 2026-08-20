-- Issue #151: Data — add unique index on users.email.
--
-- public.users.email has no unique constraint, yet several code paths treat
-- it as one (app/api/webhooks/email/route.ts's .eq("email", fromEmail)
-- .single(), and the failed-login lockout RPC). If duplicates ever exist,
-- both operate on an arbitrary one of the matching rows.
--
-- Case-folded (lower(email)) to match how every existing lookup already
-- compares, and partial on live rows only (WHERE deleted_at IS NULL) so a
-- soft-deleted user doesn't block re-registration/reuse of their email.
--
-- CONCURRENTLY decision: not used. As documented in 00000000000123 for
-- stakeholder_reviews/inbound_email_queue, this repo's migrations don't have
-- a precedent for CREATE INDEX CONCURRENTLY, and CONCURRENTLY cannot run
-- inside a transaction block, which is how this repo's migrations are
-- applied (Supabase CLI runs each migration file as a single transaction) —
-- so CONCURRENTLY simply is not an option here without changing the
-- migration runner. Unlike the low-volume tables in #134, `users` is a
-- request-path table (auth, dashboards, the email webhook lookup), so a
-- plain index build's ACCESS EXCLUSIVE lock is more likely to be felt here.
-- Judgment call, flagged for confirmation: at this app's current scale
-- (internal/B2B tool, users table size is small — 0 rows in local dev, and
-- production is not expected to be materially larger yet), a brief lock
-- during index build is very likely fine, but this should be run at a
-- low-traffic time and confirmed against actual production row count before
-- applying.

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_key
  ON users (lower(email))
  WHERE deleted_at IS NULL;
