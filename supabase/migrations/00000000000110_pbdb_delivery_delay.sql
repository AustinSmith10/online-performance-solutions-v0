-- Issue #110: independent scheduled-delay-delivery control for PBDB
-- dispatch, separate from the existing PBDR-only delivery_delay_preset.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS pbdb_delivery_delay_preset text NOT NULL DEFAULT 'normal'
  CHECK (pbdb_delivery_delay_preset IN ('expedited', 'normal', 'extended'));

-- PBDR now defaults to expedited: converting an approved PBDB to a PBDR is
-- itself the signal the job is finished, so it should go out immediately by
-- default. Only affects new projects — existing rows keep their current value.
ALTER TABLE projects
  ALTER COLUMN delivery_delay_preset SET DEFAULT 'expedited';

-- pending_deliveries now stages both PBDB and PBDR releases; discriminate by
-- delivery_type and widen the primary key so a project can have at most one
-- pending delivery per doc type at a time. Existing rows are all PBDR
-- (PBDB had no delay concept before this migration).
ALTER TABLE pending_deliveries
  ADD COLUMN IF NOT EXISTS delivery_type text NOT NULL DEFAULT 'pbdr'
  CHECK (delivery_type IN ('pbdb', 'pbdr'));

ALTER TABLE pending_deliveries DROP CONSTRAINT pending_deliveries_pkey;
ALTER TABLE pending_deliveries ADD PRIMARY KEY (project_id, delivery_type);
