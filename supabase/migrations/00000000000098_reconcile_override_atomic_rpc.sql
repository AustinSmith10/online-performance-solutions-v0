-- Extend the credit_race_events event_type vocabulary (00000000000096) to
-- cover the new RPC below, so a double-reconcile race is recorded the same
-- way the other idempotency-guard hits are.
ALTER TABLE credit_race_events DROP CONSTRAINT credit_race_events_event_type_check;
ALTER TABLE credit_race_events ADD CONSTRAINT credit_race_events_event_type_check
  CHECK (event_type IN ('deduct_credit', 'debit_deferred', 'log_upfront', 'log_override', 'reconcile_override'));

-- Closes a crash-consistency gap in reconcileOverrideAction (app/actions/credits.ts):
-- it used to read credit_balance, then do two separate un-transacted writes
-- (clear projects.payment_override, insert a credit_ledger row using the
-- stale balance read earlier). A DB error between the two writes left the
-- override silently cleared with no ledger record of the reconciliation.
--
-- Mirrors log_override's shape: lock the project row, verify there's still an
-- active override to clear (guards the same "already reconciled" race that
-- log_override guards with credit_deducted), then clear it and insert the
-- ledger row in the same transaction.

CREATE OR REPLACE FUNCTION reconcile_override(p_project_id uuid, p_performed_by uuid, p_notes text)
RETURNS TABLE(status text, balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_had_override boolean;
  v_balance integer;
  v_now timestamptz := now();
BEGIN
  SELECT client_id, payment_override INTO v_client_id, v_had_override
    FROM projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::integer;
    RETURN;
  END IF;

  IF NOT v_had_override THEN
    RETURN QUERY SELECT 'no_override'::text, NULL::integer;
    RETURN;
  END IF;

  SELECT credit_balance INTO v_balance FROM clients WHERE id = v_client_id;

  UPDATE projects SET
      payment_override = false,
      payment_override_reason = NULL,
      payment_override_at = NULL,
      payment_override_by = NULL,
      updated_at = v_now
    WHERE id = p_project_id;

  INSERT INTO credit_ledger (client_id, project_id, event_type, amount, balance_after, performed_by, notes)
    VALUES (v_client_id, p_project_id, 'override', 0, COALESCE(v_balance, 0), p_performed_by, p_notes);

  RETURN QUERY SELECT 'ok'::text, v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION reconcile_override(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reconcile_override(uuid, uuid, text) TO service_role;
