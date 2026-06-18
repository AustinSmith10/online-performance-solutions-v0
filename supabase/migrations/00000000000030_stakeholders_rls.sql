-- Enable RLS on the two stakeholder tables created in migrations 28–29.
-- All app queries use the service role (admin client) so the service role
-- policy is the operative one; the role-specific policies defend against
-- any future direct client access.

-- ─── stakeholders ────────────────────────────────────────────────────────────

ALTER TABLE stakeholders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON stakeholders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Super admins can manage stakeholders" ON stakeholders
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  );

-- ─── stakeholder_reviews ─────────────────────────────────────────────────────

ALTER TABLE stakeholder_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON stakeholder_reviews
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Super admins can manage stakeholder reviews" ON stakeholder_reviews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
  );

CREATE POLICY "Consultants can read reviews for their assigned projects" ON stakeholder_reviews
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = stakeholder_reviews.project_id
        AND projects.assigned_consultant_id = auth.uid()
    )
  );
