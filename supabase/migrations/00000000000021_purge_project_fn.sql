-- Hard-delete a project, working around FK constraints safely.
-- Must be called with service_role (via supabase.rpc from server actions).
CREATE OR REPLACE FUNCTION purge_project(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- credit_ledger uses NO ACTION — nullify before deleting
  UPDATE credit_ledger SET project_id = NULL WHERE project_id = p_project_id;

  -- audit_log uses ON DELETE SET NULL, but the immutable trigger blocks UPDATE
  -- Disable it for the duration of this transaction so the cascade can proceed
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update;

  DELETE FROM projects WHERE id = p_project_id;

  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update;
END;
$$;

GRANT EXECUTE ON FUNCTION purge_project(uuid) TO service_role;
