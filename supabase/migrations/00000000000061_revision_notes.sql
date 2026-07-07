-- ─── Revision notes on PBDB re-submission (#59) ────────────────────────────
-- Free-text "what changed" note captured from the consultant on every PBDB
-- re-submission (revision reupload or forced resend), keyed to the review
-- cycle the note explains. review_cycle here matches the project's
-- review_cycle *after* the reupload increment, i.e. the same cycle number
-- the resulting stakeholder_reviews rows are created under.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS revision_notes_required boolean NOT NULL DEFAULT false;
-- Default false (optional): most re-submissions are minor corrections where a
-- mandatory note would just add friction; clients that want a paper trail can
-- opt in per-client.

CREATE TABLE revision_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  review_cycle int NOT NULL,
  note text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE revision_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to revision notes" ON revision_notes
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Super admins can manage revision notes" ON revision_notes
  FOR ALL USING ((auth.jwt() ->> 'app_role')::text = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'app_role')::text = 'super_admin');
CREATE INDEX revision_notes_project_id_idx ON revision_notes (project_id);
