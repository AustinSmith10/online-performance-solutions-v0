-- Issue #127: numeric progress reporting for single-request server-action
-- pipelines (PBDB generation, PBDR conversion) that have no other way to
-- expose intermediate state to a separate poll request. Also reused by
-- #126 for PBDR preview generation — same class of pipeline.
--
-- Nullable: NULL means no operation currently in flight for this project.
-- Written at real pipeline boundaries only (chunked jumps), never smoothed.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS progress_pct integer
  CHECK (progress_pct IS NULL OR progress_pct BETWEEN 0 AND 100);
