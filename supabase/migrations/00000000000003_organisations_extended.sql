-- Extend organisations with fields required for org management (issue #4)
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS credit_limit integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS state_territory text,
  ADD COLUMN IF NOT EXISTS abandoned_draft_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS is_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_whitelist text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Rename column to match domain language throughout the codebase
ALTER TABLE organisations
  RENAME COLUMN delivery_timeline_days TO delivery_working_days;

-- Super admins need full write access via JWT claims (service role already covered)
CREATE POLICY "Super admins can manage organisations" ON organisations
  FOR ALL USING (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

CREATE POLICY "Super admins can manage users" ON users
  FOR ALL USING (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );
