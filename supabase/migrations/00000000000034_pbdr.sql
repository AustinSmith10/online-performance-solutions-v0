-- Issue #18: PBDB → PBDR conversion & delivery.

-- Add 'pbdr' file type for generated PDFs.
ALTER TABLE project_files DROP CONSTRAINT project_files_file_type_check;
ALTER TABLE project_files ADD CONSTRAINT project_files_file_type_check
  CHECK (file_type IN ('po', 'building_plans', 'pbdb', 'additional', 'pbdr'));

-- Track when the PBDR was delivered to the client.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
