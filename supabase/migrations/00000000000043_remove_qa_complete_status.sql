-- qa_complete status is removed: dispatch now fires immediately when the
-- consultant marks QA done, so the project goes straight to dispatched.
-- Move any projects stuck in qa_complete back to in_progress so the super
-- admin fallback dispatch button can retry them (qa_completed_by is already set).
UPDATE projects SET status = 'in_progress' WHERE status = 'qa_complete';
