-- Adds the 'reverted' event to revision_history (#108 follow-up): a
-- consultant/admin can send a delivered PBDR back to the PBDB QA cycle when
-- a stakeholder finds a post-approval issue. Distinct from 'rejected' (a
-- stakeholder declining during review) so the audit trail can tell the two
-- apart — see lib/documents/revision-history.ts.

ALTER TABLE revision_history DROP CONSTRAINT revision_history_event_check;
ALTER TABLE revision_history ADD CONSTRAINT revision_history_event_check
  CHECK (event IN ('initial', 'rejected', 'approved_conversion', 'reverted'));
