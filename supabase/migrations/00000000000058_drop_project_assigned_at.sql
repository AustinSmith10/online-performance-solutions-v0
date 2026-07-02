-- Revert 00000000000057: client-side file replacement is locked by the
-- project's current assignment state (assigned_consultant_id), not by a
-- per-file "uploaded before assignment" timestamp. This column is unused.
ALTER TABLE projects DROP COLUMN assigned_at;
