-- Migration 039 added 'paused' to the project_status enum but did not update
-- the projects_status_check constraint. This migration rebuilds the constraint
-- with 'paused' included and without the defunct 'qa_complete' value.
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN (
  'draft',
  'submitted',
  'assigned',
  'in_progress',
  'dispatched',
  'revision_required',
  'converting',
  'delivered',
  'complete',
  'paused'
));
