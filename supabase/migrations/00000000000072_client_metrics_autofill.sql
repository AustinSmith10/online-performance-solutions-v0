-- Client metrics tables (issue #51): resolver token-mapping wiring.
-- Adds the opt-in "use this table to auto-fill document fields" config on
-- top of the storage built in #50 — a match token/column, plus one or more
-- output token -> column mappings, generalizing the hardcoded
-- halcyon_developments mechanism (EXTRACT_DEV_NAME/EXTRACT_TRUSTEE/
-- EXTRACT_RAINFALL_INTENSITY) in app/actions/submission.ts.

ALTER TABLE client_metrics_tables
  ADD COLUMN autofill_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN match_token text,
  ADD COLUMN match_column_id uuid REFERENCES client_metrics_columns(id) ON DELETE SET NULL;

CREATE TABLE client_metrics_output_mappings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES client_metrics_tables(id) ON DELETE CASCADE,
  output_token text NOT NULL,
  output_column_id uuid NOT NULL REFERENCES client_metrics_columns(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(table_id, output_token)
);

CREATE INDEX client_metrics_output_mappings_table_id_idx ON client_metrics_output_mappings(table_id);

ALTER TABLE client_metrics_output_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage metrics output mappings" ON client_metrics_output_mappings
  FOR ALL
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

CREATE POLICY "Service role full access to metrics output mappings" ON client_metrics_output_mappings
  FOR ALL USING (auth.role() = 'service_role');
