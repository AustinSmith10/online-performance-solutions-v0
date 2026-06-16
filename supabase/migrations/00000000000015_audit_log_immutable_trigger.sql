-- RLS "No updates/deletes" policies do not block the service role because it
-- has BYPASSRLS. The Supabase dashboard Table Editor runs as service_role, so
-- those policies were silently skipped. Triggers are the correct mechanism:
-- they fire for every role with no bypass equivalent in Postgres.

CREATE OR REPLACE FUNCTION audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is immutable — rows cannot be updated or deleted';
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
