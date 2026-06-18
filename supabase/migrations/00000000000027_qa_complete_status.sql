-- Add qa_complete status: project QA'd by consultant, ready for stakeholder dispatch.

ALTER TABLE projects DROP CONSTRAINT projects_status_check;

ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN (
  'draft',
  'submitted',
  'assigned',
  'in_progress',
  'qa_complete',
  'dispatched',
  'revision_required',
  'converting',
  'delivered',
  'complete'
));
