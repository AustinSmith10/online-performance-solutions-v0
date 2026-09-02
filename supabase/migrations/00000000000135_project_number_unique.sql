-- A DDEG project number identifies exactly one project (every project in OPS
-- is the Solutions discipline — the "-S" suffix seen in documents is implicit
-- here), so `projects.project_number` must be unique. Until now nothing
-- enforced it: the app only showed a non-blocking "already used" warning and
-- saved anyway.
--
-- Partial, on live rows only (`deleted_at IS NULL`) so deleting/cancelling a
-- project frees its number for reuse, and on non-NULL values so any number of
-- projects can sit un-numbered before a consultant sets one. Mirrors
-- 00000000000125 (users.email) — same partial-unique-index pattern, same
-- non-CONCURRENTLY reasoning (this repo applies each migration in one
-- transaction; CONCURRENTLY can't run in one).
--
-- PRE-FLIGHT: this index build FAILS if two live projects already share a
-- number. Before applying to production, run:
--
--   SELECT project_number, count(*), array_agg(id)
--   FROM projects
--   WHERE project_number IS NOT NULL AND deleted_at IS NULL
--   GROUP BY project_number HAVING count(*) > 1;
--
-- and resolve any rows (renumber, or soft-delete the stale one) first.

CREATE UNIQUE INDEX IF NOT EXISTS projects_project_number_live_key
  ON projects (project_number)
  WHERE project_number IS NOT NULL AND deleted_at IS NULL;
