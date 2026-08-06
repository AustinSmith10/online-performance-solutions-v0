-- Collapse the "stakeholder edited their submission" admin email from
-- one-per-edit down to one-per-editing-window: the first edit fires it and
-- sets this guard, later edits in the same pre-assignment window are
-- suppressed. declineAssignment nulls it back out alongside
-- assigned_consultant_id so the reopened editing window can notify again.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS submission_edit_notified_at timestamptz;
