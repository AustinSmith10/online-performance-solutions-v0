-- Record which consultant completed QA so rejection notifications
-- always go to the right person regardless of later reassignment.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS qa_completed_by uuid REFERENCES users(id) ON DELETE SET NULL;
