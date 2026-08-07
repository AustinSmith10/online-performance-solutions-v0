-- Lets admins mark a "system_error" notification as resolved, matching the
-- resolved_at pattern already used by email_send_log and ai_provider_failures.
-- Only meaningful for type = 'system_error' today — other notification types
-- are tracked via is_read instead.
ALTER TABLE notifications ADD COLUMN resolved_at timestamptz;
