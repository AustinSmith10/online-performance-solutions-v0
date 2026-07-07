-- ─── Track which review_cycle a project_files row belongs to ──────────────────
-- Needed so the PBDB docx/PDF for a given stakeholder review cycle can be
-- retrieved unambiguously (previously only `version` existed, which drifts
-- from `review_cycle` whenever a QA correction bumps version without a cycle
-- change — see issue #72).

ALTER TABLE project_files ADD COLUMN review_cycle integer NOT NULL DEFAULT 1;
