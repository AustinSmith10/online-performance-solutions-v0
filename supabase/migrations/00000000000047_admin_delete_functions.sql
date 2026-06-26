-- Admin deletion helpers that handle the audit_log immutable trigger.
--
-- audit_log rows carry org_id / actor_id / project_id FKs with ON DELETE SET NULL.
-- That SET NULL fires as an UPDATE, which the immutable trigger blocks.
-- These SECURITY DEFINER functions run as the postgres owner so they can
-- disable/re-enable the trigger within the same transaction.

-- ── delete_user ─────────────────────────────────────────────────────────────
-- Clears audit_log references, nulls out nullable project FKs, then removes
-- the user from auth.users (cascades to public.users).
-- Blocks if the user is referenced by projects.submitted_by or project_files.uploaded_by.

CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_count int;
  v_file_count    int;
  v_role          text;
BEGIN
  SELECT role INTO v_role FROM users WHERE id = p_user_id;
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'user not found';
  END IF;
  IF v_role = 'super_admin' THEN
    RAISE EXCEPTION 'super admin accounts cannot be deleted';
  END IF;

  SELECT COUNT(*) INTO v_project_count FROM projects WHERE submitted_by = p_user_id;
  IF v_project_count > 0 THEN
    RAISE EXCEPTION 'user is the submitter of % project(s) — purge them first', v_project_count;
  END IF;

  SELECT COUNT(*) INTO v_file_count FROM project_files WHERE uploaded_by = p_user_id;
  IF v_file_count > 0 THEN
    RAISE EXCEPTION 'user has % uploaded project file(s) — delete the associated projects first', v_file_count;
  END IF;

  -- Null nullable FK references before deleting (avoids FK violations on non-cascade columns)
  UPDATE projects SET assigned_consultant_id = NULL WHERE assigned_consultant_id = p_user_id;
  UPDATE projects SET payment_override_by    = NULL WHERE payment_override_by    = p_user_id;
  UPDATE stakeholder_reviews SET waived_by   = NULL WHERE waived_by              = p_user_id;

  -- Null out audit_log.actor_id — the ON DELETE SET NULL would do this automatically,
  -- but the immutable trigger blocks that. We do it manually with the trigger disabled.
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update;
  UPDATE audit_log SET actor_id = NULL WHERE actor_id = p_user_id;
  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update;

  -- Delete from auth.users — cascades to public.users (ON DELETE CASCADE)
  DELETE FROM auth.users WHERE id = p_user_id;
END;
$$;

-- ── delete_organisation ──────────────────────────────────────────────────────
-- Blocks if any projects reference this org (NOT NULL FK cannot be nulled).
-- Disaffiliates users (nulls org_id), removes credit_ledger / stakeholders /
-- templates, then nulls audit_log.org_id with the trigger disabled.

CREATE OR REPLACE FUNCTION admin_delete_organisation(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_count int;
  v_org_name      text;
BEGIN
  SELECT name INTO v_org_name FROM organisations WHERE id = p_org_id;
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'organisation not found';
  END IF;

  SELECT COUNT(*) INTO v_project_count FROM projects WHERE org_id = p_org_id;
  IF v_project_count > 0 THEN
    RAISE EXCEPTION
      'organisation has % project(s) including soft-deleted — purge them all first',
      v_project_count;
  END IF;

  -- Disaffiliate users (org_id is nullable)
  UPDATE users SET org_id = NULL WHERE org_id = p_org_id;

  -- Remove dependent rows
  DELETE FROM credit_ledger  WHERE org_id   = p_org_id;
  DELETE FROM stakeholders   WHERE scope = 'org' AND scope_id = p_org_id;
  DELETE FROM templates      WHERE org_id   = p_org_id;  -- field_mappings etc cascade

  -- Null audit_log.org_id — same trigger workaround as above
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update;
  UPDATE audit_log SET org_id = NULL WHERE org_id = p_org_id;
  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update;

  DELETE FROM organisations WHERE id = p_org_id;
END;
$$;

-- Only the service role should be able to call these
REVOKE EXECUTE ON FUNCTION admin_delete_user(uuid)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_delete_organisation(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_delete_user(uuid)         TO service_role;
GRANT  EXECUTE ON FUNCTION admin_delete_organisation(uuid) TO service_role;
