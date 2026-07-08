-- Gates admin-pushed consultant assignments behind an explicit accept step.
-- Null while a pushed assignment is awaiting the consultant's response; set
-- immediately on self-assignment (picking up a job IS the acceptance).
ALTER TABLE projects ADD COLUMN accepted_at timestamptz;
