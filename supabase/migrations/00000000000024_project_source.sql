ALTER TABLE projects
  ADD COLUMN source text NOT NULL DEFAULT 'portal'
  CHECK (source IN ('portal', 'email'));
