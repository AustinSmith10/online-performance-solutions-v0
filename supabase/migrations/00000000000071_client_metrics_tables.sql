-- Client metrics tables (issue #50): admin-configurable, per-client structured
-- tables with typed columns, populated via Excel upload or a manual edit grid.
-- Fully generic — no "development"/Halcyon-specific naming. Resolver/auto-fill
-- wiring (opt-in flag, match token, output token mappings) is a later slice
-- (issue #51); this migration only covers table/column/row storage.

CREATE TABLE client_metrics_tables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_metrics_tables_client_id_idx ON client_metrics_tables(client_id);

CREATE TABLE client_metrics_columns (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES client_metrics_tables(id) ON DELETE CASCADE,
  name text NOT NULL,
  data_type text NOT NULL CHECK (data_type IN ('text', 'number', 'date')),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_metrics_columns_table_id_idx ON client_metrics_columns(table_id);

-- Row data is stored as a jsonb map of column id -> value (all values kept as
-- text/number/date-string; column data_type governs display/validation) so the
-- schema stays generic regardless of what columns a given client defines.
CREATE TABLE client_metrics_rows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id uuid NOT NULL REFERENCES client_metrics_tables(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX client_metrics_rows_table_id_idx ON client_metrics_rows(table_id);

ALTER TABLE client_metrics_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_metrics_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_metrics_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage metrics tables" ON client_metrics_tables
  FOR ALL
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

CREATE POLICY "Service role full access to metrics tables" ON client_metrics_tables
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins can manage metrics columns" ON client_metrics_columns
  FOR ALL
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

CREATE POLICY "Service role full access to metrics columns" ON client_metrics_columns
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins can manage metrics rows" ON client_metrics_rows
  FOR ALL
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'))
  WITH CHECK ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin'));

CREATE POLICY "Service role full access to metrics rows" ON client_metrics_rows
  FOR ALL USING (auth.role() = 'service_role');
