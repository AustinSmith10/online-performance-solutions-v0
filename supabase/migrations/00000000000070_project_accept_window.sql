-- Per-client accept-window setting (issue #53): how long a consultant has to
-- accept/decline an admin-pushed assignment before it's flagged overdue.
ALTER TABLE clients ADD COLUMN accept_window_working_days integer NOT NULL DEFAULT 1;

-- Dedup guard for the accept-window overdue alert job, mirroring
-- projects.review_buffer_fired_at's role in the approval-buffer job.
ALTER TABLE projects ADD COLUMN accept_overdue_alert_fired_at timestamptz;
