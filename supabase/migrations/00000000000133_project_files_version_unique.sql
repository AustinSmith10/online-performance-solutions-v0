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
-- Scoped to `file_type IN ('pbdb','pbdr')` — the only types where `version`
-- is an allocated counter. The submission-upload / evidence path
-- (`purchase_order`, `construction_issue_drawing`, `additional`, `pbdb_pdf`)
-- does NOT increment `version` per slot: uploading a corrected file into a
-- slot legitimately produces another row at the same version, and production
-- already has three such pairs. A full unique index would both fail to
-- build and wrongly constrain that path.
--
-- Expand-only and safe to add ahead of the code that depends on it: it adds
-- no NOT NULL, changes no existing shape. Production has zero pbdb/pbdr
-- duplicates on (project_id, version), so the partial index builds without a
-- VALIDATE step.

CREATE UNIQUE INDEX IF NOT EXISTS project_files_project_type_version_key
  ON project_files (project_id, file_type, version)
  WHERE file_type IN ('pbdb', 'pbdr');
