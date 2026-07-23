-- Durable, admin-visible record of credit-ledger idempotency-guard hits
-- (issue #103): the atomic RPCs in 00000000000097_credit_ledger_atomic_rpcs.sql
-- return an 'already_deducted' status when a project's credit_deducted flag
-- is claimed twice (duplicate webhook/retry racing the same project). The JS
-- wrapper in lib/payments/ledger.ts inserts a row here whenever that happens
-- so the race is never silent — surfaced on /admin/system-health the same
-- way bounce_events are, and resolvable via the shared resolved_signals table
-- (see trayId.creditRace in lib/notifications/tray-id.ts).

CREATE TABLE credit_race_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('deduct_credit', 'debit_deferred', 'log_upfront', 'log_override')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX credit_race_events_detected_at_idx ON credit_race_events(detected_at DESC);
CREATE INDEX credit_race_events_unresolved_idx ON credit_race_events(resolved_at) WHERE resolved_at IS NULL;

ALTER TABLE credit_race_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON credit_race_events
  USING (auth.role() = 'service_role');
