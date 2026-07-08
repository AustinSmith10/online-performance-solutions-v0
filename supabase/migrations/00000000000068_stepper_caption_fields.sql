-- ─── Fields needed for the stakeholder delivery tracker stepper (issue #54) ────
-- pbdb_downloaded_at distinguishes the "assessing" vs "working on your report"
-- in_progress captions without treating the audit log as a state source.
-- show_consultant_name lets an org opt out of naming their consultant in captions.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS pbdb_downloaded_at timestamptz;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS show_consultant_name boolean NOT NULL DEFAULT true;
