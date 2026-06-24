-- Add paused status to project_status enum
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'paused';

-- Columns to support pause/resume
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS paused_at          timestamptz,
  ADD COLUMN IF NOT EXISTS paused_previous_status text,
  ADD COLUMN IF NOT EXISTS pause_reason       text;
