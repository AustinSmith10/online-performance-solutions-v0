-- ─── Add 'admin' to the user_role enum ─────────────────────────────────────────
-- 'admin' is a Restricted Super Admin: full platform access minus audit log,
-- org creation, payment overrides/reconciliation, and managing privileged accounts.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin' AFTER 'super_admin';

-- ─── users ───────────────────────────────────────────────────────────────────────
-- Super admin keeps its existing ALL policy (reads/manages every user).
-- Admin gets a scoped policy: SELECT and manage consultant/client rows only.

CREATE POLICY "Admin users can read consultant and client users" ON users
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'app_role')::text = 'admin'
    AND role IN ('consultant', 'client')
  );

CREATE POLICY "Admin users can manage consultant and client users" ON users
  FOR ALL TO authenticated
  USING (
    (auth.jwt() ->> 'app_role')::text = 'admin'
    AND role IN ('consultant', 'client')
  )
  WITH CHECK (
    (auth.jwt() ->> 'app_role')::text = 'admin'
    AND role IN ('consultant', 'client')
  );

-- ─── organisations ───────────────────────────────────────────────────────────────
-- Admin can manage existing orgs (UPDATE); org creation is application-enforced.

ALTER POLICY "Super admins can manage organisations" ON organisations
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

-- ─── projects ────────────────────────────────────────────────────────────────────

ALTER POLICY "Super admins can manage projects" ON projects
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

-- Extend the client insert policy to also allow super_admin and admin (GAP 1).
ALTER POLICY "Clients can insert projects for their org" ON projects
  WITH CHECK (
    (
      (auth.jwt() ->> 'app_role')::text = 'client'
      AND org_id IN (SELECT org_id FROM users WHERE id = auth.uid())
      AND submitted_by = auth.uid()
    )
    OR (auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin')
  );

-- ─── templates ───────────────────────────────────────────────────────────────────

ALTER POLICY "Super admins can manage templates" ON templates
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

ALTER POLICY "Super admins can manage template mappings" ON template_field_mappings
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

-- ─── file_requirements ───────────────────────────────────────────────────────────

ALTER POLICY "Super admins can manage file requirements" ON file_requirements
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

-- ─── project_files ───────────────────────────────────────────────────────────────

ALTER POLICY "Super admins can manage project files" ON project_files
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

-- ─── credit_ledger ───────────────────────────────────────────────────────────────
-- Admin can read the credit ledger; writes remain service-role only (immutable).

ALTER POLICY "Super admins can read credit ledger" ON credit_ledger
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

-- ─── audit_log ───────────────────────────────────────────────────────────────────
-- Intentionally unchanged: admin cannot read the audit log.

-- ─── stakeholders ────────────────────────────────────────────────────────────────

ALTER POLICY "Super admins can manage stakeholders" ON stakeholders
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

-- ─── stakeholder_reviews ─────────────────────────────────────────────────────────

ALTER POLICY "Super admins can manage stakeholder reviews" ON stakeholder_reviews
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

-- ─── storage: templates bucket ───────────────────────────────────────────────────

ALTER POLICY "Super admins can upload templates" ON storage.objects
  WITH CHECK (
    bucket_id = 'templates'
    AND (auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin')
  );

ALTER POLICY "Super admins can read templates" ON storage.objects
  USING (
    bucket_id = 'templates'
    AND (auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin')
  );

-- ─── storage: submissions bucket ─────────────────────────────────────────────────

ALTER POLICY "Super admins can read all submissions" ON storage.objects
  USING (
    bucket_id = 'submissions'
    AND (auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin')
  );

-- ─── storage: documents bucket ───────────────────────────────────────────────────

ALTER POLICY "Super admins can read all documents" ON storage.objects
  USING (
    bucket_id = 'documents'
    AND (auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin')
  );
