-- Issue #168: make the PBDB-dispatch side-effect atomic.
--
-- dispatchPbdb() previously ran ~5 sequential un-transacted, un-.error-checked
-- writes: per-stakeholder stakeholder_reviews upsert → projects.status =
-- 'dispatched' → audit log. When one write failed (the migration-123
-- token_hash schema drift), the loop completed silently, the project still
-- flipped to 'dispatched', emails still sent — leaving ~50 dispatches where
-- the project reads as dispatched everywhere status-driven but no review
-- rows exist, so the portal shows the stakeholder "nothing needs you".
--
-- This function folds review-row upsert + status transition + audit into one
-- transaction. Partial failure rolls the whole thing back; status is never
-- advanced unless the rows were written. It also asserts, before returning,
-- that the review-row count for the cycle is at least the number of
-- stakeholders it was asked to write — a silent partial write now RAISEs and
-- rolls back instead of leaving the project stranded. Emails are sent by the
-- caller only after this commits.
--
-- p_reviews is a JSON array of objects:
--   { "email", "name", "token", "token_hash", "expires_at" (ISO 8601) }
-- Tokens/hashes are generated in application code (crypto there, not here)
-- and passed in.

CREATE OR REPLACE FUNCTION dispatch_pbdb_reviews(
  p_project_id uuid,
  p_review_cycle int,
  p_reviews jsonb,
  p_actor_id uuid,
  p_org_id uuid,
  p_audit_metadata jsonb
)
RETURNS TABLE(review_row_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_expected integer := jsonb_array_length(p_reviews);
  v_actual integer;
BEGIN
  IF v_expected IS NULL OR v_expected = 0 THEN
    RAISE EXCEPTION 'dispatch_pbdb_reviews: no stakeholders supplied for project %', p_project_id;
  END IF;

  -- One row per stakeholder for this cycle. Re-dispatch of the same cycle
  -- (e.g. recovering a stranded project) refreshes token/expiry and resets
  -- the row to pending.
  INSERT INTO stakeholder_reviews (
    project_id, review_cycle, stakeholder_email, stakeholder_name,
    token, token_hash, dispatched_at, expires_at,
    fresh_token_sent_at, status, comments, responded_at
  )
  SELECT
    p_project_id,
    p_review_cycle,
    lower(r->>'email'),
    r->>'name',
    r->>'token',
    r->>'token_hash',
    v_now,
    (r->>'expires_at')::timestamptz,
    NULL,
    'pending',
    NULL,
    NULL
  FROM jsonb_array_elements(p_reviews) AS r
  ON CONFLICT (project_id, review_cycle, stakeholder_email)
  DO UPDATE SET
    stakeholder_name    = EXCLUDED.stakeholder_name,
    token               = EXCLUDED.token,
    token_hash          = EXCLUDED.token_hash,
    dispatched_at       = EXCLUDED.dispatched_at,
    expires_at          = EXCLUDED.expires_at,
    fresh_token_sent_at = NULL,
    status              = 'pending',
    comments            = NULL,
    responded_at        = NULL;

  -- Advance status only now that the rows exist.
  UPDATE projects
    SET status = 'dispatched', updated_at = v_now
    WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispatch_pbdb_reviews: project % not found', p_project_id;
  END IF;

  -- Audit in the same transaction (actor_email is not available to the
  -- dispatch worker path, matching the previous auditLog(..., null) call).
  INSERT INTO audit_log (event_type, actor_id, actor_email, project_id, client_id, metadata)
    VALUES ('project.pbdb_dispatched', p_actor_id, NULL, p_project_id, p_org_id, p_audit_metadata);

  -- Post-write assertion. `<` not `<>`: a stale extra row (a stakeholder
  -- removed from the roster between dispatches whose row persists) is
  -- harmless, but a MISSING row is the exact outage signature and must
  -- roll the whole dispatch back.
  SELECT count(*) INTO v_actual
    FROM stakeholder_reviews
    WHERE project_id = p_project_id AND review_cycle = p_review_cycle;

  IF v_actual < v_expected THEN
    RAISE EXCEPTION
      'dispatch_pbdb_reviews: expected >= % review rows for project % cycle %, found %',
      v_expected, p_project_id, p_review_cycle, v_actual;
  END IF;

  RETURN QUERY SELECT v_actual;
END;
$$;

REVOKE EXECUTE ON FUNCTION dispatch_pbdb_reviews(uuid, int, jsonb, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dispatch_pbdb_reviews(uuid, int, jsonb, uuid, uuid, jsonb) TO service_role;
