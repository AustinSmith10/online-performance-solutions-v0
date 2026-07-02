-- Track when a project was first assigned to a consultant, independent of the
-- general-purpose `updated_at` bump field. Used to gate client-side file
-- replacement: a client can always add new documents, but can only replace an
-- existing document if it was uploaded on/after this timestamp (i.e. not part
-- of the original pre-assignment submission).
ALTER TABLE projects ADD COLUMN assigned_at timestamptz;
