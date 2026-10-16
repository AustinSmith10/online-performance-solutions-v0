-- Build-audit CRITICAL: SECURITY DEFINER RPCs were callable by anon/authenticated.
--
-- Every earlier migration did `REVOKE EXECUTE ... FROM PUBLIC` and granted
-- service_role, but Supabase's default privileges grant EXECUTE on new public
-- functions to anon and authenticated *directly*, so revoking from PUBLIC left
-- them callable via POST /rest/v1/rpc/<fn> with just the public anon key
-- (top_up_credit, admin_delete_user, admin_delete_client, ...). None of these
-- functions check the caller.
--
-- Expand-safe: every app call site goes through createAdminClient()
-- (service_role), which keeps EXECUTE.
--
-- Exception: functions referenced from RLS policies are evaluated as the
-- querying role, so they keep EXECUTE for authenticated (anon is still revoked).

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.sig);

    IF EXISTS (
      SELECT 1 FROM pg_policies pol
      WHERE (coalesce(pol.qual, '') || coalesce(pol.with_check, ''))
            ~ ('\m' || fn.proname || '\(')
    ) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
    END IF;
  END LOOP;
END
$$;

-- Future functions start closed. A new function that RLS policies or the
-- browser client must call needs an explicit GRANT in its own migration.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

-- Only public table without RLS; accessed solely via the claim_extraction_slot
-- definer RPC and the service role.
ALTER TABLE extraction_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON extraction_usage_events FROM anon, authenticated;
