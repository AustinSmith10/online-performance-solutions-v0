-- Closes a TOCTOU race in login() (app/actions/auth.ts): it used to
-- select failed_login_count then update it to count+1 as two separate
-- calls, so concurrent failed attempts for the same account (e.g. a
-- distributed brute force) could under-count and never trip the 15-attempt
-- lockout. Locks the user row and increments in a single statement instead.

-- Output column is "locked" rather than "is_locked" — PL/pgSQL treats an
-- OUT/RETURNS-TABLE column name as an implicit variable in scope for the
-- whole function body, and users.is_locked collides with it (ambiguous
-- reference, 42702) as soon as it's read via SELECT/UPDATE...RETURNING.
CREATE OR REPLACE FUNCTION record_failed_login(p_email text)
RETURNS TABLE(status text, user_id uuid, new_count integer, locked boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_already_locked boolean;
  v_new_count integer;
  v_now_locked boolean;
BEGIN
  SELECT u.id, u.is_locked INTO v_id, v_already_locked
    FROM users u WHERE u.email = p_email FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::integer, NULL::boolean;
    RETURN;
  END IF;

  IF v_already_locked THEN
    RETURN QUERY SELECT 'already_locked'::text, v_id, NULL::integer, true;
    RETURN;
  END IF;

  UPDATE users u SET failed_login_count = u.failed_login_count + 1
    WHERE u.id = v_id
    RETURNING u.failed_login_count INTO v_new_count;

  v_now_locked := v_new_count >= 15;
  IF v_now_locked THEN
    UPDATE users u SET is_locked = true WHERE u.id = v_id;
  END IF;

  RETURN QUERY SELECT 'ok'::text, v_id, v_new_count, v_now_locked;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_failed_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_failed_login(text) TO service_role;
