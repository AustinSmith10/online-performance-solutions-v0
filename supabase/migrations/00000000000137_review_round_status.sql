-- Issue #191: track stakeholder review round (= review cycle) status, and
-- bump the PBDB revision number when a round *closes* rejected — not at the
-- first individual rejection while other stakeholders are still pending.
--
-- Expand-only: a new column with a default (old code's inserts get 'open'),
-- a looser status CHECK (adds 'superseded'), a nullable column on
-- revision_history, and backfills. Nothing the running app reads changes.

-- 1. Round status, shared by every row of a (project_id, review_cycle).
ALTER TABLE stakeholder_reviews
  ADD COLUMN round_status text NOT NULL DEFAULT 'open';

ALTER TABLE stakeholder_reviews
  ADD CONSTRAINT stakeholder_reviews_round_status_check
  CHECK (round_status IN ('open', 'closed_approved', 'closed_rejected', 'superseded')) NOT VALID;

-- 2. A forced close (revised PBDB uploaded mid-round) marks still-pending
--    rows 'superseded' — internal/audit only, and no longer "pending"
--    anywhere pending is counted.
ALTER TABLE stakeholder_reviews
  DROP CONSTRAINT stakeholder_reviews_status_check;

ALTER TABLE stakeholder_reviews
  ADD CONSTRAINT stakeholder_reviews_status_check
  CHECK (status IN (
    'pending',
    'approved_without_comments',
    'approved_with_comments',
    'rejected_with_comments',
    'waived',
    'superseded'
  )) NOT VALID;

-- 3. Which review round a revision_history row closed — makes the
--    once-per-round bump idempotent (and auditable).
ALTER TABLE revision_history
  ADD COLUMN review_cycle integer;

-- 4. Backfill round_status from what already happened.
WITH rounds AS (
  SELECT
    sr.project_id,
    sr.review_cycle,
    bool_or(sr.status = 'rejected_with_comments') AS has_rejection,
    bool_or(sr.status = 'pending') AS has_pending,
    p.review_cycle AS current_cycle
  FROM stakeholder_reviews sr
  JOIN projects p ON p.id = sr.project_id
  GROUP BY sr.project_id, sr.review_cycle, p.review_cycle
)
UPDATE stakeholder_reviews sr
SET round_status = CASE
    -- An older cycle abandoned mid-round by a revised upload.
    WHEN r.review_cycle < r.current_cycle AND r.has_pending THEN
      CASE
        WHEN sr.status <> 'pending' AND r.has_rejection THEN 'closed_rejected'
        ELSE 'superseded'
      END
    WHEN r.has_pending THEN 'open'
    WHEN r.has_rejection THEN 'closed_rejected'
    ELSE 'closed_approved'
  END
FROM rounds r
WHERE sr.project_id = r.project_id
  AND sr.review_cycle = r.review_cycle;

UPDATE stakeholder_reviews sr
SET status = 'superseded'
FROM projects p
WHERE p.id = sr.project_id
  AND sr.status = 'pending'
  AND sr.review_cycle < p.review_cycle;

-- 5. Under the old rule the bump already happened at a current round's
--    first rejection. Tag that revision_history row with the round so the
--    round's eventual close doesn't bump a second time.
UPDATE revision_history rh
SET review_cycle = p.review_cycle
FROM projects p
WHERE rh.project_id = p.id
  AND rh.doc_type = 'pbdb'
  AND rh.event = 'rejected'
  AND rh.id = (
    SELECT rh2.id FROM revision_history rh2
    WHERE rh2.project_id = p.id AND rh2.doc_type = 'pbdb' AND rh2.event = 'rejected'
    ORDER BY rh2.rev_number DESC
    LIMIT 1
  )
  AND EXISTS (
    SELECT 1 FROM stakeholder_reviews sr
    WHERE sr.project_id = p.id
      AND sr.review_cycle = p.review_cycle
      AND sr.status = 'rejected_with_comments'
      AND rh.created_at >= sr.dispatched_at
  );

-- 6. Re-dispatching the same cycle (stranded-project recovery) reopens its
--    round along with resetting each row to pending.
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

  INSERT INTO stakeholder_reviews (
    project_id, review_cycle, stakeholder_email, stakeholder_name,
    token, token_hash, dispatched_at, expires_at,
    fresh_token_sent_at, status, comments, responded_at, round_status
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
    NULL,
    'open'
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
    responded_at        = NULL,
    round_status        = 'open';

  -- Any other row of this cycle (a stakeholder no longer on the roster)
  -- belongs to the same, now reopened, round.
  UPDATE stakeholder_reviews
    SET round_status = 'open'
    WHERE project_id = p_project_id AND review_cycle = p_review_cycle;

  UPDATE projects
    SET status = 'dispatched', updated_at = v_now
    WHERE id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dispatch_pbdb_reviews: project % not found', p_project_id;
  END IF;

  INSERT INTO audit_log (event_type, actor_id, actor_email, project_id, client_id, metadata)
    VALUES ('project.pbdb_dispatched', p_actor_id, NULL, p_project_id, p_org_id, p_audit_metadata);

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
