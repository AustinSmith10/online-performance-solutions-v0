-- Issue #87: throttle self-serve password-reset requests per email and per IP,
-- independent of whether the email belongs to a real account.

CREATE TABLE password_reset_attempts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_reset_attempts_email_created_at_idx
  ON password_reset_attempts (email, created_at);

CREATE INDEX password_reset_attempts_ip_created_at_idx
  ON password_reset_attempts (ip, created_at);

ALTER TABLE password_reset_attempts ENABLE ROW LEVEL SECURITY;

-- Only the service role reads/writes (all access goes through the service role client)
CREATE POLICY "Service role has full access" ON password_reset_attempts
  USING (auth.role() = 'service_role');
