CREATE TABLE public_holiday_cache (
  state_territory text NOT NULL,
  year integer NOT NULL,
  holidays jsonb NOT NULL DEFAULT '[]',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (state_territory, year)
);

-- Service role only — internal cache table, no client access needed
CREATE POLICY "Service role has full access" ON public_holiday_cache
  USING (auth.role() = 'service_role');

ALTER TABLE public_holiday_cache ENABLE ROW LEVEL SECURITY;
