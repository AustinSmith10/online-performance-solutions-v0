-- Issue #152: per-user AI extraction spend/usage budget.
--
-- AI document extraction is auth-gated and file-size-capped, but nothing
-- between authentication and the Anthropic call checks a spend/usage budget
-- — credit gating only happens later, at dispatch. A compromised or careless
-- account can currently run unlimited billed extractions.
--
-- One events table (one row per extraction attempt) rather than a single
-- per-user counter row, because the limit is a rolling 24-hour window, not a
-- fixed calendar day — a counter-with-reset-at-midnight shape would let a
-- user burn their whole limit at 23:59 and another full limit one minute
-- later. Counting rows in the trailing window is the direct way to get true
-- rolling-window semantics.
--
-- Concurrency: the credit-ledger RPCs (00000000000097) lock a single
-- per-entity row with SELECT ... FOR UPDATE before checking + mutating. There
-- is no equivalent row to lock here — the constraint is on an aggregate
-- (COUNT(*) over a time window), and FOR UPDATE cannot lock the rows an
-- aggregate reads in a way that blocks a concurrent INSERT from another
-- session. Instead, claim_extraction_slot serializes concurrent claims for
-- the same user with a transaction-scoped advisory lock
-- (pg_advisory_xact_lock, released automatically at commit/rollback — no
-- explicit unlock needed, no risk of a stuck lock from a crashed session),
-- then counts and inserts inside that lock. Same "lock, check under the
-- lock, act under the lock" shape as the ledger RPCs, different locking
-- primitive because the thing being protected isn't a single row.

CREATE TABLE extraction_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX extraction_usage_events_user_created_idx
  ON extraction_usage_events (user_id, created_at);

CREATE OR REPLACE FUNCTION claim_extraction_slot(
  p_user_id uuid,
  p_limit integer,
  p_window_hours integer DEFAULT 24
)
RETURNS TABLE(status text, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  -- Serializes concurrent claims for the same user only — claims for
  -- different users never contend with each other.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Opportunistic cleanup, scoped to the row we already hold the lock for:
  -- once an event is outside any window this function will ever check
  -- (2x buffer against a future larger p_window_hours), it can never affect
  -- another claim again, so drop it here rather than needing a separate
  -- purge job.
  DELETE FROM extraction_usage_events
    WHERE user_id = p_user_id
      AND created_at < now() - (p_window_hours || ' hours')::interval * 2;

  SELECT count(*) INTO v_count
    FROM extraction_usage_events
    WHERE user_id = p_user_id
      AND created_at > now() - (p_window_hours || ' hours')::interval;

  IF v_count >= p_limit THEN
    RETURN QUERY SELECT 'limit_reached'::text, 0;
    RETURN;
  END IF;

  INSERT INTO extraction_usage_events (user_id) VALUES (p_user_id);

  RETURN QUERY SELECT 'ok'::text, (p_limit - v_count - 1);
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_extraction_slot(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_extraction_slot(uuid, integer, integer) TO service_role;
