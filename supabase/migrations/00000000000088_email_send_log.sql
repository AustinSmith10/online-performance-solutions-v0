CREATE TABLE email_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text NOT NULL,
  source text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('sent', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_send_log_created_at_idx ON email_send_log(created_at DESC);
CREATE INDEX email_send_log_failed_idx ON email_send_log(created_at DESC) WHERE status = 'failed';

ALTER TABLE email_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON email_send_log
  USING (auth.role() = 'service_role');
