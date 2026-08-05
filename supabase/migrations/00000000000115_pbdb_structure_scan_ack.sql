-- #112: PBDB 2-click upload/send failsafe with preview.
--
-- Adds the deterministic docx-structure scan's findings (open comments,
-- highlighted runs, tracked changes) alongside the existing filename-mismatch
-- reason (#109), plus a consultant acknowledgment pair covering both. A
-- specific pbdb project_files row (one per upload/version) is the natural
-- scope for "has this been reviewed" — a fresh re-upload gets its own row
-- and therefore its own unacknowledged findings, never inheriting the prior
-- version's acknowledgment.
ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS structure_scan_findings jsonb,
  ADD COLUMN IF NOT EXISTS qa_flags_acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS qa_flags_acknowledged_by uuid REFERENCES users(id);
