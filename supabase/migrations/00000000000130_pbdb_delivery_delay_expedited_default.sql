-- Issue #170: default a PBDB dispatch to "expedited".
--
-- pbdb_delivery_delay_preset defaulted to 'normal' (1 working day) — added
-- in migration 00000000000110 by copying the PBDR delay model — so an
-- untouched dropdown silently deferred every reviewer notification to the
-- next morning. A PBDB dispatch is a reviewer notification, not a client
-- deliverable: the QA-complete + dispatch click is itself the signal the
-- step is finished, so it should go out immediately by default.
--
-- Migration 00000000000110 made exactly this change for the PBDR
-- delivery_delay_preset, with the same rationale. Only affects new
-- projects — existing rows keep their current value.

ALTER TABLE projects
  ALTER COLUMN pbdb_delivery_delay_preset SET DEFAULT 'expedited';
