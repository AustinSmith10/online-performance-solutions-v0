-- AI provider (OpenAI/Anthropic) quota/rate-limit failures, surfaced to
-- admins so a silently fail-open extraction pipeline (empty results, never
-- an error to the stakeholder) doesn't go unnoticed. Mirrors email_send_log
-- (00000000000088/00000000000104): service-role-only RLS since every read
-- goes through createAdminClient() in admin server components/actions, own
-- resolved_at column rather than the generic resolved_signals table since
-- this needs a dedicated resolve action like email_send_log's.
CREATE TABLE ai_provider_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('openai', 'anthropic')),
  status text NOT NULL CHECK (status IN ('quota_exceeded', 'rate_limited')),
  context text NOT NULL,
  error text,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX ai_provider_failures_created_at_idx ON ai_provider_failures(created_at DESC);
CREATE INDEX ai_provider_failures_unresolved_idx ON ai_provider_failures(created_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE ai_provider_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON ai_provider_failures
  USING (auth.role() = 'service_role');
