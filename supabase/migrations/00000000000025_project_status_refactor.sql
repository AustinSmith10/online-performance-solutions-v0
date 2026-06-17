-- Refactor project status from 9 old statuses to 9 new statuses.
--
-- Removed: in_review, qa, approved, delivered
--   (in_review/qa/approved were unreliable manual steps with no system trigger;
--    delivered is merged into complete)
--
-- Added: in_progress, revision_required, converting, delivered (renamed semantics)
--   in_progress  — system-set when consultant downloads the PBDB
--   revision_required — stakeholder/client requests changes to the PBDB
--   converting   — PBDB approved, conversion to PBDR underway
--   delivered    — PBDR sent to client via email + notification
--
-- Migration map for any existing rows with old statuses:
--   in_review  → in_progress
--   qa         → in_progress
--   approved   → in_progress
--   delivered  → complete

-- Step 1: migrate existing rows before the constraint changes
UPDATE projects SET status = 'in_progress' WHERE status IN ('in_review', 'qa', 'approved');
UPDATE projects SET status = 'complete'    WHERE status = 'delivered';

-- Step 2: drop the old check constraint (Postgres names it automatically from the column)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_status_check;

-- Step 3: add the new constraint
ALTER TABLE projects ADD CONSTRAINT projects_status_check CHECK (status IN (
  'draft',
  'submitted',
  'assigned',
  'in_progress',
  'dispatched',
  'revision_required',
  'converting',
  'delivered',
  'complete'
));
