-- ─── Admin nav super-admin restrictions ─────────────────────────────────────
-- Which admin nav items are hidden from plain "admin" users (visible only to
-- "super_admin"). Stored as a list of nav item keys in app_settings.

INSERT INTO app_settings (key, value) VALUES
  ('admin_nav_super_admin_restrictions', '{"restricted": []}'::jsonb)
ON CONFLICT (key) DO NOTHING;
