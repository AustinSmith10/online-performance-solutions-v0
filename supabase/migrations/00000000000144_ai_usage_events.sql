-- Per-call AI token usage log, for the admin usage view in Settings.
--
-- Expand-only: a new table nothing reads yet. Written by the app through the
-- service role after each Anthropic call; never exposed to the browser roles
-- (RLS on, no policies, no grants), matching extraction_usage_events (143).
-- user_id / project_id are SET NULL so deleting a user or purging a project
-- (admin_delete_user, purge_project) never trips over usage history.

CREATE TABLE ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  feature text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0
);

CREATE INDEX ai_usage_events_created_idx ON ai_usage_events (created_at DESC);
CREATE INDEX ai_usage_events_project_idx ON ai_usage_events (project_id) WHERE project_id IS NOT NULL;

ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ai_usage_events FROM anon, authenticated;

-- Aggregation for the admin usage view (PostgREST caps a plain select at 1000
-- rows, so summing client-side would silently undercount). INVOKER, not
-- DEFINER: only the service role calls it, and it already bypasses RLS.
CREATE OR REPLACE FUNCTION ai_usage_summary(p_since timestamptz)
RETURNS TABLE(feature text, model text, calls bigint, input_tokens bigint, output_tokens bigint)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT e.feature, e.model, count(*), sum(e.input_tokens)::bigint, sum(e.output_tokens)::bigint
    FROM ai_usage_events e
   WHERE e.created_at >= p_since
   GROUP BY e.feature, e.model
   ORDER BY sum(e.input_tokens) DESC;
$$;

REVOKE EXECUTE ON FUNCTION ai_usage_summary(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ai_usage_summary(timestamptz) TO service_role;
