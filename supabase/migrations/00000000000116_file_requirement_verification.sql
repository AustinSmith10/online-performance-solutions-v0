-- #113: Stakeholder source-document verification layer (deterministic + AI judge).
--
-- Every file_requirements row gets its own optional deterministic markers and
-- a required-going-forward AI-judge hint (existing seeded rows may have
-- neither configured yet — both checks simply skip when unconfigured, per
-- the fail-open design). An admin may also optionally attach a reference
-- sample file for human reference only; it feeds neither automated check.
ALTER TABLE file_requirements
  ADD COLUMN IF NOT EXISTS marker_text_patterns text[],
  ADD COLUMN IF NOT EXISTS marker_page_count_min integer,
  ADD COLUMN IF NOT EXISTS marker_page_count_max integer,
  ADD COLUMN IF NOT EXISTS marker_regex text,
  ADD COLUMN IF NOT EXISTS ai_judge_hint text,
  ADD COLUMN IF NOT EXISTS reference_sample_storage_path text;

-- Verification findings live on the uploaded file's own project_files row —
-- same pattern as the PBDB filename-mismatch/structure-scan flags (#109/#112):
-- a soft, per-file mismatch reason plus a confirmation pair, scoped to that
-- exact upload so a fresh re-upload never inherits a prior confirmation.
ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS verification_mismatch_reasons jsonb,
  ADD COLUMN IF NOT EXISTS verification_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_confirmed_by uuid REFERENCES users(id);
