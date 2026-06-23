-- ─── add extraction flag to file_requirements ────────────────────────────────

ALTER TABLE file_requirements
  ADD COLUMN extraction boolean NOT NULL DEFAULT false;
