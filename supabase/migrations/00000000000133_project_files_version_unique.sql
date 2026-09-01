-- Issue #172: atomic version allocation for heavy document generation.
--
-- PBDB generation (and the PBDR paths) allocate `project_files.version` by
-- reading the current MAX(version) and adding one, then insert. Two
-- concurrent "Generate" / "Regenerate" clicks on the same project could both
-- read the same MAX and both insert `version = N`, silently producing two
-- project_files rows for the same logical version — which then desyncs the
-- version↔review-cycle matching the dispatch flow relies on.
--
-- This unique index makes that race lose loudly: the second inserter gets a
-- 23505 unique_violation instead of a duplicate row, and the caller aborts
-- cleanly (the winner's file is already durably stored).
--
-- Expand-only and safe to add ahead of the code that depends on it: it adds
-- no NOT NULL, changes no existing shape. Production was checked for existing
-- duplicates on (project_id, file_type, version) before this shipped — there
-- were none, so the index builds without a VALIDATE step.

CREATE UNIQUE INDEX IF NOT EXISTS project_files_project_type_version_key
  ON project_files (project_id, file_type, version);
