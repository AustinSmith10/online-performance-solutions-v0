-- Admin "hard system errors" chit (issue #45): surfaces failed pg-boss jobs
-- and (once a webhook exists) email bounce events.
--
-- pg-boss owns its own `pgboss` schema, created at runtime by the worker
-- process (boss.start()) rather than by our migrations, so it may not exist
-- yet when this migration runs in a fresh environment. check_function_bodies
-- is turned off for this function's creation so Postgres doesn't try to
-- resolve pgboss.job against the catalog at CREATE FUNCTION time.

SET LOCAL check_function_bodies = off;

CREATE OR REPLACE FUNCTION get_failed_jobs()
RETURNS TABLE (
  id uuid,
  name text,
  data jsonb,
  output jsonb,
  retry_count integer,
  retry_limit integer,
  created_on timestamptz,
  completed_on timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT j.id, j.name, j.data, j.output, j.retry_count, j.retry_limit, j.created_on, j.completed_on
    FROM pgboss.job j
    WHERE j.state = 'failed'
    ORDER BY j.completed_on DESC
    LIMIT 100;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_failed_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_failed_jobs() TO service_role;

-- Stub for future inbound-email-bounce wiring (see docs/email-provider-comparison.md
-- — outbound-only today, no webhook receiver exists yet). Table + policies are
-- added now so the chit's query shape doesn't change once a webhook lands.
CREATE TABLE bounce_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  reason text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX bounce_events_created_at_idx ON bounce_events(created_at DESC);
CREATE INDEX bounce_events_unresolved_idx ON bounce_events(resolved_at) WHERE resolved_at IS NULL;

ALTER TABLE bounce_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON bounce_events
  USING (auth.role() = 'service_role');
