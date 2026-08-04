-- Issue #108: append-only revision-history log for PBDB/PBDR documents,
-- replacing the SYS_REV_NO single-token substitution with a real growing
-- table rendered via a docxtemplater loop. One row per project-lifetime
-- event (initial generation, rejection, approval-conversion) — rows are
-- never rewritten, and the PBDB/PBDR counters never reset when a project
-- converts back and forth between the two doc types.

CREATE TABLE revision_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  doc_type text NOT NULL CHECK (doc_type IN ('pbdb', 'pbdr')),
  rev_number int NOT NULL,
  -- Snapshot of the consultant assigned to the project when the event fired
  -- (see lib/documents/revision-history.ts) — deliberately not the literal
  -- actor, and never rewritten by a later reassignment.
  prepared_by uuid REFERENCES users(id),
  event text NOT NULL CHECK (event IN ('initial', 'rejected', 'approved_conversion')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX revision_history_project_doc_idx ON revision_history(project_id, doc_type, rev_number);
CREATE INDEX revision_history_project_created_idx ON revision_history(project_id, created_at);

ALTER TABLE revision_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role has full access" ON revision_history
  FOR ALL TO service_role USING (true) WITH CHECK (true);
