-- Add paused status to project_status enum (no-op if status is a text column with a
-- CHECK constraint instead of an enum type — the constraint is added by a later migration)
DO $$ BEGIN
  ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'paused';
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

-- Columns to support pause/resume
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS paused_at          timestamptz,
  ADD COLUMN IF NOT EXISTS paused_previous_status text,
  ADD COLUMN IF NOT EXISTS pause_reason       text;
