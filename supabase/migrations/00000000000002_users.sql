CREATE TYPE user_role AS ENUM ('super_admin', 'consultant', 'client');
CREATE TYPE consultant_availability AS ENUM ('available', 'on_leave', 'at_capacity');

CREATE TABLE users (
  id uuid REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email text NOT NULL,
  first_name text,
  last_name text,
  phone text,
  company_role text,
  state_territory text,
  role user_role NOT NULL,
  org_id uuid REFERENCES organisations(id),
  availability consultant_availability NOT NULL DEFAULT 'available',
  is_locked boolean NOT NULL DEFAULT false,
  totp_enabled boolean NOT NULL DEFAULT false,
  profile_complete boolean NOT NULL DEFAULT false,
  failed_login_count integer NOT NULL DEFAULT 0,
  invited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own profile" ON users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Super admins can read all users" ON users
  FOR SELECT USING (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
    OR auth.role() = 'service_role'
  );

CREATE POLICY "Service role has full access" ON users
  USING (auth.role() = 'service_role');

-- Now that users exists, add the cross-reference policy on organisations
CREATE POLICY "Users can read their own org" ON organisations
  FOR SELECT USING (
    id IN (SELECT org_id FROM users WHERE id = auth.uid())
  );
