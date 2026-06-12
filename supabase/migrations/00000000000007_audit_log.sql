CREATE TABLE audit_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_email text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  org_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Only the service role may write (all audit calls go through the service role client)
CREATE POLICY "Service role has full access" ON audit_log
  USING (auth.role() = 'service_role');

-- Super admins can read all entries
CREATE POLICY "Super admins can read audit log" ON audit_log
  FOR SELECT USING (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

-- Immutability: no UPDATE or DELETE by any authenticated role
CREATE POLICY "No updates on audit log" ON audit_log
  FOR UPDATE USING (false);

CREATE POLICY "No deletes on audit log" ON audit_log
  FOR DELETE USING (false);

-- Index for common filter patterns
CREATE INDEX audit_log_actor_email_idx ON audit_log (actor_email);
CREATE INDEX audit_log_event_type_idx ON audit_log (event_type);
CREATE INDEX audit_log_project_id_idx ON audit_log (project_id);
CREATE INDEX audit_log_created_at_idx ON audit_log (created_at DESC);
