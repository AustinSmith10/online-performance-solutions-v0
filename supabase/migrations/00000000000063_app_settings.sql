-- ─── App-wide settings ──────────────────────────────────────────────────────
-- Generic key/value store for platform-level config that isn't scoped to a
-- single client (see clients.client_config for org-scoped config). First use:
-- the twice-daily available-requests digest send times (#71).

CREATE TABLE app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON app_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Admins can manage app settings" ON app_settings
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

INSERT INTO app_settings (key, value) VALUES
  ('available_requests_digest_schedule', '{"morning":"09:00","afternoon":"15:00"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
