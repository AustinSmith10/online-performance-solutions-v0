-- Issue #68: email-reply threading for stakeholder approvals. Stores the raw
-- reply text (no auto-interpretation) and whether the replying sender could be
-- verified against the project/client stakeholder roster, so the consultant
-- knows whether to double-check identity before resolving via the #65 form.

ALTER TABLE stakeholder_reviews
  ADD COLUMN IF NOT EXISTS email_reply_text text,
  ADD COLUMN IF NOT EXISTS email_reply_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_reply_sender_verified boolean;
