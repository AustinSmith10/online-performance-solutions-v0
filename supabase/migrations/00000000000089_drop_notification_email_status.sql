-- email_send_log (00000000000088) is now the single source of truth for
-- send outcomes across every sendEmail() caller, superseding this per-notification
-- tracking added in 00000000000087 which only covered the notify() path.
ALTER TABLE notifications
  DROP COLUMN email_status,
  DROP COLUMN email_error;
