-- Issue #195: track per-revision whether the consultant has downloaded the
-- revision-populated working PBDB (#194 — the download route patches the
-- table/cover once the round closes rejected).
--
-- Scoped to the revision_history row rather than a single column on
-- `projects`, since revision_history already gets a fresh row per rejected
-- round (migration 00000000000119-ish / #191's bumpRevisionForRound) — no
-- extra reset-on-redispatch logic is needed, unlike a `projects` column
-- which would need explicit nulling every cycle.
--
-- Expand-only: nullable, no backfill needed (existing rows simply read as
-- "not yet downloaded", which is correct — nobody has downloaded a
-- revision-populated copy of a pre-#194 row).

ALTER TABLE revision_history
  ADD COLUMN working_pbdb_downloaded_at timestamptz;
