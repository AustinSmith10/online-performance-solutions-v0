-- Security fix: template_stakeholders (migration 100) and
-- client_config_token_links (migration 102) were created without RLS,
-- leaving them readable/writable by any authenticated (or anon, if the
-- anon key is exposed) client via PostgREST. Both are admin-only config
-- tables, matching the pattern used for template_field_mappings and
-- file_requirements (migrations 8, 49).

-- ─── template_stakeholders ───────────────────────────────────────────────────

ALTER TABLE template_stakeholders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage template stakeholders" ON template_stakeholders
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

CREATE POLICY "Service role has full access to template stakeholders" ON template_stakeholders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── client_config_token_links ───────────────────────────────────────────────

ALTER TABLE client_config_token_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage client config token links" ON client_config_token_links
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

CREATE POLICY "Service role has full access to client config token links" ON client_config_token_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);
