-- Atomic credit-ledger RPCs (issue #103): close two races that existed in
-- the old lib/payments/ledger.ts, which did a read-then-write with no lock:
--
-- 1. Two concurrent dispatches for the same client racing the balance check
--    (both read balance=1, both decrement, balance goes negative).
-- 2. The same project being billed twice (retry / duplicate webhook), which
--    survives even after (1) is fixed since it's a different row.
--
-- Fixed here by locking the client row with SELECT ... FOR UPDATE (serialises
-- concurrent calls for the same client — closes race 1) and folding a
-- `credit_deducted` claim (UPDATE ... WHERE credit_deducted = false) into the
-- same transaction as the balance mutation and ledger insert (closes race 2).
-- Losing the credit_deducted claim returns status 'already_deducted' rather
-- than throwing — that is expected, retryable behaviour, not a DB error.
--
-- Five single-purpose functions rather than one generic one, mirroring the
-- five JS functions 1:1 (each has different gating: frozen/limit only apply
-- to deferred, balance only applies to credit_deduction, top-up has no gate
-- at all) — consistent with the existing purge_project style.
--
-- Status values (never thrown, always returned): ok | insufficient_balance |
-- frozen | limit_reached | already_deducted | not_found. Only genuine DB
-- errors reject normally. lib/payments/ledger.ts translates these back into
-- the same throw-on-failure behaviour these functions had before, so callers
-- of deductCredit/debitDeferred/etc. are unaffected.

CREATE OR REPLACE FUNCTION deduct_credit(p_client_id uuid, p_project_id uuid, p_performed_by uuid)
RETURNS TABLE(status text, new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
  v_claimed integer;
BEGIN
  SELECT credit_balance INTO v_balance FROM clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::integer;
    RETURN;
  END IF;

  UPDATE projects SET credit_deducted = true, updated_at = now()
    WHERE id = p_project_id AND credit_deducted = false;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN QUERY SELECT 'already_deducted'::text, v_balance;
    RETURN;
  END IF;

  IF v_balance < 1 THEN
    UPDATE projects SET credit_deducted = false WHERE id = p_project_id;
    RETURN QUERY SELECT 'insufficient_balance'::text, v_balance;
    RETURN;
  END IF;

  v_new_balance := v_balance - 1;
  UPDATE clients SET credit_balance = v_new_balance, updated_at = now() WHERE id = p_client_id;

  INSERT INTO credit_ledger (client_id, project_id, event_type, amount, balance_after, performed_by)
    VALUES (p_client_id, p_project_id, 'deduction', -1, v_new_balance, p_performed_by);

  RETURN QUERY SELECT 'ok'::text, v_new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION deduct_credit(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION deduct_credit(uuid, uuid, uuid) TO service_role;


CREATE OR REPLACE FUNCTION debit_deferred(p_client_id uuid, p_project_id uuid, p_performed_by uuid)
RETURNS TABLE(status text, new_deferred_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deferred integer;
  v_limit integer;
  v_frozen boolean;
  v_new_deferred integer;
  v_claimed integer;
BEGIN
  SELECT deferred_balance, credit_limit, is_frozen
    INTO v_deferred, v_limit, v_frozen
    FROM clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::integer;
    RETURN;
  END IF;

  UPDATE projects SET credit_deducted = true, updated_at = now()
    WHERE id = p_project_id AND credit_deducted = false;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN QUERY SELECT 'already_deducted'::text, v_deferred;
    RETURN;
  END IF;

  IF v_frozen THEN
    UPDATE projects SET credit_deducted = false WHERE id = p_project_id;
    RETURN QUERY SELECT 'frozen'::text, v_deferred;
    RETURN;
  END IF;

  IF v_limit > 0 AND v_deferred >= v_limit THEN
    UPDATE projects SET credit_deducted = false WHERE id = p_project_id;
    RETURN QUERY SELECT 'limit_reached'::text, v_deferred;
    RETURN;
  END IF;

  v_new_deferred := v_deferred + 1;
  UPDATE clients SET deferred_balance = v_new_deferred, updated_at = now() WHERE id = p_client_id;

  INSERT INTO credit_ledger (client_id, project_id, event_type, amount, balance_after, performed_by, notes)
    VALUES (p_client_id, p_project_id, 'deferred_debit', -1, v_new_deferred, p_performed_by, 'Deferred tab: ' || v_new_deferred);

  RETURN QUERY SELECT 'ok'::text, v_new_deferred;
END;
$$;

REVOKE EXECUTE ON FUNCTION debit_deferred(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION debit_deferred(uuid, uuid, uuid) TO service_role;


-- No idempotency guard, no gate: top-up is a pure addition, two concurrent
-- top-ups don't corrupt anything, they just both need to land. This closes
-- only the crash-consistency gap (balance updated but ledger insert fails).
CREATE OR REPLACE FUNCTION top_up_credit(p_client_id uuid, p_amount integer, p_performed_by uuid, p_notes text DEFAULT NULL)
RETURNS TABLE(status text, new_balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_new_balance integer;
BEGIN
  SELECT credit_balance INTO v_balance FROM clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::integer;
    RETURN;
  END IF;

  v_new_balance := v_balance + p_amount;
  UPDATE clients SET credit_balance = v_new_balance, updated_at = now() WHERE id = p_client_id;

  INSERT INTO credit_ledger (client_id, event_type, amount, balance_after, performed_by, notes)
    VALUES (p_client_id, 'top_up', p_amount, v_new_balance, p_performed_by, p_notes);

  RETURN QUERY SELECT 'ok'::text, v_new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION top_up_credit(uuid, integer, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION top_up_credit(uuid, integer, uuid, text) TO service_role;


-- Brought into scope alongside deduct/deferred: same credit_deducted race
-- shape (duplicate webhook would otherwise write a second zero-amount
-- upfront_log row — no financial double-spend, but an audit-trail gap).
CREATE OR REPLACE FUNCTION log_upfront(p_client_id uuid, p_project_id uuid, p_performed_by uuid)
RETURNS TABLE(status text, balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance integer;
  v_claimed integer;
BEGIN
  SELECT credit_balance INTO v_balance FROM clients WHERE id = p_client_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::integer;
    RETURN;
  END IF;

  UPDATE projects SET credit_deducted = true, updated_at = now()
    WHERE id = p_project_id AND credit_deducted = false;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN QUERY SELECT 'already_deducted'::text, v_balance;
    RETURN;
  END IF;

  INSERT INTO credit_ledger (client_id, project_id, event_type, amount, balance_after, performed_by, notes)
    VALUES (p_client_id, p_project_id, 'upfront_log', 0, v_balance, p_performed_by, 'Upfront payment — ledger entry only');

  RETURN QUERY SELECT 'ok'::text, v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_upfront(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_upfront(uuid, uuid, uuid) TO service_role;


-- Included for consistency even though it's admin-button-driven rather than
-- retry/webhook-driven. Reuses credit_deducted as the same generic
-- "payment obligation resolved" guard the other three payment methods use.
CREATE OR REPLACE FUNCTION log_override(p_project_id uuid, p_performed_by uuid, p_reason text)
RETURNS TABLE(status text, balance integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
  v_balance integer;
  v_claimed integer;
  v_now timestamptz := now();
BEGIN
  SELECT client_id INTO v_client_id FROM projects WHERE id = p_project_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::integer;
    RETURN;
  END IF;

  SELECT credit_balance INTO v_balance FROM clients WHERE id = v_client_id;

  UPDATE projects SET
      payment_override = true,
      payment_override_reason = p_reason,
      payment_override_at = v_now,
      payment_override_by = p_performed_by,
      credit_deducted = true,
      updated_at = v_now
    WHERE id = p_project_id AND credit_deducted = false;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;
  IF v_claimed = 0 THEN
    RETURN QUERY SELECT 'already_deducted'::text, v_balance;
    RETURN;
  END IF;

  INSERT INTO credit_ledger (client_id, project_id, event_type, amount, balance_after, performed_by, notes)
    VALUES (v_client_id, p_project_id, 'override', 0, v_balance, p_performed_by, p_reason);

  RETURN QUERY SELECT 'ok'::text, v_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION log_override(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION log_override(uuid, uuid, text) TO service_role;
