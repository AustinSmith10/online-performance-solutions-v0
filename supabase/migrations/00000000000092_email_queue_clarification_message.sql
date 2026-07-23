-- The clarification request (#101 follow-up, migration 91) originally sent a
-- fixed, non-editable template. The admin/consultant now free-types the
-- actual message — this records exactly what was sent, for audit/reference,
-- alongside the candidate-review snapshot already captured.

ALTER TABLE inbound_email_queue
  ADD COLUMN clarification_message text;
