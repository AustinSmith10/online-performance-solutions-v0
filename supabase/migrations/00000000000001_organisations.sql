CREATE TABLE organisations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  payment_method text NOT NULL CHECK (payment_method IN ('upfront', 'credit_deduction', 'deferred')),
  credit_balance integer NOT NULL DEFAULT 0,
  delivery_timeline_days integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role has full access" ON organisations
  USING (auth.role() = 'service_role');
