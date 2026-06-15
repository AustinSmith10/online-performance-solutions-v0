ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS projects_deleted_at_idx ON projects (deleted_at)
  WHERE deleted_at IS NOT NULL;
