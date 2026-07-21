-- #67: records which pipeline stage a flag was resolved at, alongside the
-- existing who/when/reason. A plain snapshot of projects.status at resolve
-- time — not a separate enum, so it never drifts from the pipeline's own
-- status vocabulary.
ALTER TABLE field_flags
  ADD COLUMN resolved_stage text;
