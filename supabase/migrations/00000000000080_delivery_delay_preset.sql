-- ─── Configurable delivery delay presets (#66) ─────────────────────────────
-- Per-project preset (Expedited/Normal/Extended) applied to PBDR generation
-- and final client delivery, on top of the business-hours gating from #63.
-- The stakeholder-review dispatch step (lib/stakeholders/dispatch.ts) is
-- unaffected. Normal/Extended durations are configured globally below;
-- Expedited is always immediate and not configurable.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS delivery_delay_preset text NOT NULL DEFAULT 'normal'
  CHECK (delivery_delay_preset IN ('expedited', 'normal', 'extended'));

INSERT INTO app_settings (key, value) VALUES
  ('delivery_delay_durations', '{"normalHours":24,"extendedHours":72}'::jsonb)
ON CONFLICT (key) DO NOTHING;
