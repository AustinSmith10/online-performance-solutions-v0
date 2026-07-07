-- ─── field_flags table ──────────────────────────────────────────────────────
-- One row per extracted field per project that needs review. Generic `type`
-- so a later flag type (e.g. cross-file inconsistency detection, #64) can
-- reuse this same model without a schema change.

CREATE TABLE field_flags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'confidence',
  field_key text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  current_value text NOT NULL DEFAULT '',
  candidate_values jsonb NOT NULL DEFAULT '[]',
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  resolution_method text CHECK (resolution_method IN ('dropdown', 'freetext')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE field_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access to field flags" ON field_flags
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Super admins can manage field flags" ON field_flags
  FOR ALL USING ((auth.jwt() ->> 'app_role')::text = 'super_admin')
  WITH CHECK ((auth.jwt() ->> 'app_role')::text = 'super_admin');
CREATE UNIQUE INDEX field_flags_open_unique_idx
  ON field_flags (project_id, field_key, type) WHERE status = 'open';
CREATE INDEX field_flags_project_id_idx ON field_flags (project_id);
