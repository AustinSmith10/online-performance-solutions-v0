ALTER TABLE notifications
  ADD COLUMN email_status text NOT NULL DEFAULT 'pending'
    CHECK (email_status IN ('pending', 'sent', 'skipped', 'failed')),
  ADD COLUMN email_error text;

CREATE INDEX notifications_email_status_failed_idx ON notifications(created_at DESC)
  WHERE email_status = 'failed';
