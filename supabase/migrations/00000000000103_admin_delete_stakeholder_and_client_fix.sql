-- Two things:
--
-- 1. admin_delete_client (renamed from admin_delete_organisation in migration 055)
--    still referenced the pre-rename table/column names (organisations, org_id)
--    in its body — ALTER TABLE ... RENAME does not rewrite identifiers inside
--    existing plpgsql function bodies. It has never been called from app code,
--    so this went unnoticed. Recreate it against the current schema.
--
-- 2. Add admin_delete_stakeholder, the hard-delete counterpart to the existing
--    soft-delete (`deleted_at`) used by removeOrgStakeholder/removeProjectStakeholder,
--    following the same pattern as admin_delete_user/admin_delete_client.

-- CREATE OR REPLACE can't rename an existing function's parameter
-- (p_org_id → p_client_id), so drop and recreate.
DROP FUNCTION IF EXISTS admin_delete_client(uuid);

CREATE FUNCTION admin_delete_client(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_count int;
  v_client_name   text;
BEGIN
  SELECT name INTO v_client_name FROM clients WHERE id = p_client_id;
  IF v_client_name IS NULL THEN
    RAISE EXCEPTION 'client not found';
  END IF;

  SELECT COUNT(*) INTO v_project_count FROM projects WHERE client_id = p_client_id;
  IF v_project_count > 0 THEN
    RAISE EXCEPTION
      'client has % project(s) including soft-deleted — purge them all first',
      v_project_count;
  END IF;

  -- Disaffiliate users (client_id is nullable)
  UPDATE users SET client_id = NULL WHERE client_id = p_client_id;

  -- client_config_token_links.stakeholder_id is ON DELETE RESTRICT, and these
  -- rows only get cascade-removed via clients at the very end of this
  -- function, so they must be cleared before the stakeholders delete below.
  DELETE FROM client_config_token_links WHERE client_id = p_client_id;

  -- Remove dependent rows
  DELETE FROM credit_ledger  WHERE client_id = p_client_id;
  DELETE FROM stakeholders   WHERE scope = 'org' AND scope_id = p_client_id;
  DELETE FROM templates      WHERE client_id = p_client_id;  -- field_mappings etc cascade

  -- Null audit_log.client_id — the ON DELETE SET NULL would do this
  -- automatically, but the immutable trigger blocks that.
  ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update;
  UPDATE audit_log SET client_id = NULL WHERE client_id = p_client_id;
  ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update;

  DELETE FROM clients WHERE id = p_client_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_delete_client(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_delete_client(uuid) TO service_role;

-- ── admin_delete_stakeholder ─────────────────────────────────────────────────
-- Blocks if the stakeholder is linked to a client_config token (RESTRICT FK —
-- unlink it from the client config first). template_stakeholders rows cascade
-- automatically. stakeholder_reviews carries a point-in-time copy of the
-- stakeholder's name/email rather than an FK, so it is unaffected.

CREATE OR REPLACE FUNCTION admin_delete_stakeholder(p_stakeholder_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_count int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stakeholders WHERE id = p_stakeholder_id) THEN
    RAISE EXCEPTION 'stakeholder not found';
  END IF;

  SELECT COUNT(*) INTO v_token_count
    FROM client_config_token_links WHERE stakeholder_id = p_stakeholder_id;
  IF v_token_count > 0 THEN
    RAISE EXCEPTION
      'stakeholder is linked to % client config token(s) — unlink it first',
      v_token_count;
  END IF;

  DELETE FROM stakeholders WHERE id = p_stakeholder_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION admin_delete_stakeholder(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION admin_delete_stakeholder(uuid) TO service_role;
