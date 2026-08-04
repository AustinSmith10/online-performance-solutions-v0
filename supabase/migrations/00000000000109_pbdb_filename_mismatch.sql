-- Issue #109: soft mismatch flag on a re-uploaded QA'd PBDB whose filename
-- doesn't match the currently-expected pattern/revision. Informational only
-- — never blocks the upload.

ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS filename_mismatch_reason text;
