-- Account tags (#211): reusable coloured labels ("Manager", "VIP", "Test
-- account") the super admin creates and staff assign to accounts of any role.
-- Internal-only: stakeholder sessions must never see a tag or an assignment,
-- including their own, so neither table has any stakeholder policy (RLS is
-- default-deny) and no stakeholder-facing query reads them.
--
-- Expand only (docs/adr/0001): two new tables, nothing existing is altered,
-- so the currently-running app version is unaffected.
--
-- All app reads/writes go through the service role in server actions that
-- enforce who may assign what (lib/tags/permissions.ts). The policies below
-- are the second layer for any direct client access: internal roles may read;
-- only the super admin may write.

CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  -- #rrggbb, validated so the value is safe to drop into a style attribute.
  color text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness: "vip" and "VIP" are the same tag.
CREATE UNIQUE INDEX tags_name_lower_idx ON tags (lower(btrim(name)));

CREATE TABLE account_tags (
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tag_id, user_id)
);

CREATE INDEX account_tags_user_idx ON account_tags (user_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role has full access" ON account_tags
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Internal roles can read tags" ON tags
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('consultant', 'admin', 'super_admin')
    )
  );

CREATE POLICY "Internal roles can read tag assignments" ON account_tags
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('consultant', 'admin', 'super_admin')
    )
  );

CREATE POLICY "Super admin can manage tags" ON tags
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'));

CREATE POLICY "Super admin can manage tag assignments" ON account_tags
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'));
