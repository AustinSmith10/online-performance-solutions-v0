-- Issue #84: index hot foreign keys filtered on nearly every portal/dashboard page load.

CREATE INDEX IF NOT EXISTS projects_client_id_idx ON projects (client_id);
CREATE INDEX IF NOT EXISTS projects_status_idx ON projects (status);
CREATE INDEX IF NOT EXISTS projects_assigned_consultant_id_idx ON projects (assigned_consultant_id);

CREATE INDEX IF NOT EXISTS project_files_project_id_idx ON project_files (project_id);

CREATE INDEX IF NOT EXISTS credit_ledger_client_id_idx ON credit_ledger (client_id);
