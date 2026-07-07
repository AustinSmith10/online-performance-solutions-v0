-- Extend the soft-delete pattern (see 00000000000013_soft_delete.sql) to
-- templates, stakeholders, users, and clients.

ALTER TABLE templates ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS templates_deleted_at_idx ON templates (deleted_at)
  WHERE deleted_at IS NOT NULL;

ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS stakeholders_deleted_at_idx ON stakeholders (deleted_at)
  WHERE deleted_at IS NOT NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS users_deleted_at_idx ON users (deleted_at)
  WHERE deleted_at IS NOT NULL;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS clients_deleted_at_idx ON clients (deleted_at)
  WHERE deleted_at IS NOT NULL;

-- ── Client cascade helpers ────────────────────────────────────────────────────
-- Deleting/restoring a client must cascade to its templates, org-scoped
-- stakeholders, and non-terminal projects atomically. A single captured
-- timestamp is stamped across every cascaded row so restore can distinguish
-- "deleted as part of this cascade" from "already independently deleted"
-- (only rows whose deleted_at exactly matches the client's are restored).

CREATE OR REPLACE FUNCTION soft_delete_client(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  UPDATE clients SET deleted_at = v_now WHERE id = p_client_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'client not found or already deleted';
  END IF;

  UPDATE templates SET deleted_at = v_now
    WHERE client_id = p_client_id AND deleted_at IS NULL;

  UPDATE stakeholders SET deleted_at = v_now
    WHERE scope = 'org' AND scope_id = p_client_id AND deleted_at IS NULL;

  UPDATE projects SET deleted_at = v_now
    WHERE client_id = p_client_id AND deleted_at IS NULL
      AND status NOT IN ('complete', 'delivered');
END;
$$;

CREATE OR REPLACE FUNCTION restore_client(p_client_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_at timestamptz;
BEGIN
  SELECT deleted_at INTO v_deleted_at FROM clients WHERE id = p_client_id;
  IF v_deleted_at IS NULL THEN
    RAISE EXCEPTION 'client not found or not deleted';
  END IF;

  UPDATE templates SET deleted_at = NULL
    WHERE client_id = p_client_id AND deleted_at = v_deleted_at;

  UPDATE stakeholders SET deleted_at = NULL
    WHERE scope = 'org' AND scope_id = p_client_id AND deleted_at = v_deleted_at;

  UPDATE projects SET deleted_at = NULL
    WHERE client_id = p_client_id AND deleted_at = v_deleted_at;

  UPDATE clients SET deleted_at = NULL WHERE id = p_client_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION soft_delete_client(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION restore_client(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION soft_delete_client(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION restore_client(uuid) TO service_role;
