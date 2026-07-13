-- ─── Business-hours gating for automated status updates (#63) ─────────────
-- Configurable business-hours window, following the same app_settings
-- pattern as the digest schedule (#71).

INSERT INTO app_settings (key, value) VALUES
  ('business_hours', '{"start":"09:00","end":"17:00"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Auto-triggered PBDR deliveries (see lib/documents/delivery.ts) that would
-- otherwise complete outside business hours are staged here instead of
-- running immediately. A worker cron sweeps due rows and runs the delivery
-- once the next business-hours window opens.
CREATE TABLE pending_deliveries (
  project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  scheduled_for timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pending_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON pending_deliveries
  FOR ALL TO service_role USING (true) WITH CHECK (true);
