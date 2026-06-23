-- ─── add Halcyon Bayside to developments lookup ─────────────────────────────────

INSERT INTO halcyon_developments (dev_name, project_code, aep, trustee_entity) VALUES
  ('Halcyon Bayside', '', 244, 'Stockland LLC No. 4 Pty Ltd ACN 657 303 501 in its capacity as trustee for the SLLP1 Redland Trust')
ON CONFLICT (dev_name) DO NOTHING;
