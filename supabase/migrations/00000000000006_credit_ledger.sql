-- Credit event type enum
CREATE TYPE credit_event_type AS ENUM (
  'top_up',
  'deduction',
  'deferred_debit',
  'upfront_log',
  'override'
);

-- Immutable credit ledger — no UPDATE or DELETE permitted by any role
CREATE TABLE credit_ledger (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES organisations(id),
  project_id uuid REFERENCES projects(id),
  event_type credit_event_type NOT NULL,
  amount integer NOT NULL,
  balance_after integer NOT NULL,
  performed_by uuid REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;

-- Service role can write (all operations routed through service role in lib/payments)
CREATE POLICY "Service role has full access" ON credit_ledger
  USING (auth.role() = 'service_role');

-- Super admins can read (for the credits UI)
CREATE POLICY "Super admins can read credit ledger" ON credit_ledger
  FOR SELECT USING (
    (auth.jwt() ->> 'app_role')::text = 'super_admin'
  );

-- Immutability: no UPDATE or DELETE for any authenticated role
CREATE POLICY "No updates on credit ledger" ON credit_ledger
  FOR UPDATE USING (false);

CREATE POLICY "No deletes on credit ledger" ON credit_ledger
  FOR DELETE USING (false);

-- Add payment columns to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS credit_deducted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_override_reason text,
  ADD COLUMN IF NOT EXISTS payment_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_override_by uuid REFERENCES users(id);

-- Add deferred running-tab column to organisations
ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS deferred_balance integer NOT NULL DEFAULT 0;
