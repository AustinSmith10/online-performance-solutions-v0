-- Migration: Rename organisations → clients, org_id → client_id, role client → stakeholder
-- Deploy atomically with the code release that references the new names.

-- ── 1. Rename table ──────────────────────────────────────────────────────────
ALTER TABLE organisations RENAME TO clients;

-- ── 2. Rename org_config column on clients ────────────────────────────────────
ALTER TABLE clients RENAME COLUMN org_config TO client_config;

-- ── 3. Rename org_id on dependant tables ─────────────────────────────────────
-- Postgres automatically updates policy expressions that reference these columns.
ALTER TABLE projects      RENAME COLUMN org_id TO client_id;
ALTER TABLE users         RENAME COLUMN org_id TO client_id;
ALTER TABLE audit_log     RENAME COLUMN org_id TO client_id;
ALTER TABLE credit_ledger RENAME COLUMN org_id TO client_id;

-- ── 4. Role value rename: "client" → "stakeholder" ───────────────────────────
-- Policies that reference users.role (the column) block ALTER COLUMN TYPE.
-- Drop them now; recreate them below with updated values.

DROP POLICY IF EXISTS "Admin users can read consultant and client users" ON users;
DROP POLICY IF EXISTS "Admin users can manage consultant and client users" ON users;
DROP POLICY IF EXISTS "Super admins can manage stakeholders" ON stakeholders;
DROP POLICY IF EXISTS "Super admins can manage stakeholder reviews" ON stakeholder_reviews;

-- Convert role column to text, update data, recreate enum, restore column type.
ALTER TABLE users ALTER COLUMN role TYPE text;
DROP TYPE user_role;

UPDATE users SET role = 'stakeholder' WHERE role = 'client';

CREATE TYPE user_role AS ENUM ('super_admin', 'admin', 'consultant', 'stakeholder');
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;

-- Recreate the four dropped policies with 'stakeholder' replacing 'client'.

CREATE POLICY "Admin users can read consultant and stakeholder users" ON users
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'app_role')::text = 'admin'
    AND role IN ('consultant', 'stakeholder')
  );

CREATE POLICY "Admin users can manage consultant and stakeholder users" ON users
  FOR ALL TO authenticated
  USING (
    (auth.jwt() ->> 'app_role')::text = 'admin'
    AND role IN ('consultant', 'stakeholder')
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role')::text = 'admin'
    AND role IN ('consultant', 'stakeholder')
  );

CREATE POLICY "Super admins can manage stakeholders" ON stakeholders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')
    )
  );

CREATE POLICY "Super admins can manage stakeholder reviews" ON stakeholder_reviews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role IN ('super_admin', 'admin')
    )
  );

-- ── 5. Update app_role JWT claim checks from 'client' → 'stakeholder' ─────────
-- These policies use the JWT app_role claim (not the column), so they don't
-- block the type change but must be updated so the claim still grants access
-- after auth.users.app_metadata.role is migrated to 'stakeholder'.

ALTER POLICY "Clients can insert projects for their org" ON projects
  WITH CHECK (
    (
      (auth.jwt() ->> 'app_role')::text = 'stakeholder'
      AND client_id IN (SELECT client_id FROM users WHERE id = auth.uid())
      AND submitted_by = auth.uid()
    )
    OR (auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin')
  );

-- ── 6. Update auth.users app_metadata for existing stakeholder accounts ────────
-- This syncs the JWT app_role claim for existing users so RLS policies match.
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || '{"role": "stakeholder"}'::jsonb
WHERE raw_app_meta_data ->> 'role' = 'client';

-- ── 7. Rename RPC ─────────────────────────────────────────────────────────────
ALTER FUNCTION admin_delete_organisation(uuid) RENAME TO admin_delete_client;
