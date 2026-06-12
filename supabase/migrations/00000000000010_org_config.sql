ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS org_config jsonb NOT NULL DEFAULT '{}';
