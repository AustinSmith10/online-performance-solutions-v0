-- Tighten the service-role policy to INSERT-only.
-- The original "FOR ALL" accidentally granted UPDATE and DELETE to the service role,
-- contradicting the immutability contract. The service role only ever writes new rows;
-- it has BYPASSRLS anyway, so this is a belt-and-suspenders correctness fix.

DROP POLICY "Service role has full access" ON audit_log;

CREATE POLICY "Service role can insert audit log" ON audit_log
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
