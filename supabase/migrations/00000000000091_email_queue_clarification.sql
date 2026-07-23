-- Issue: a stakeholder_table_fallback queue entry (sender matched via the
-- `stakeholders` table, no reply token) carries no project/review context at
-- all — the admin is left free-text searching blind. This adds a
-- "request clarification" loop: an admin/consultant can ask the sender to
-- pick from their open review cycles (or supply an address/PO if they have
-- none), and the reply threads back onto this same row via a per-entry
-- MailboxHash token, the same mechanism stakeholder_reviews.token already
-- uses for #68.

ALTER TABLE inbound_email_queue
  DROP CONSTRAINT inbound_email_queue_status_check;

ALTER TABLE inbound_email_queue
  ADD CONSTRAINT inbound_email_queue_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'awaiting_clarification'));

ALTER TABLE inbound_email_queue
  ADD COLUMN clarification_token       text UNIQUE,
  ADD COLUMN clarification_expires_at  timestamptz,
  ADD COLUMN clarification_requested_at timestamptz,
  ADD COLUMN clarification_requested_by uuid REFERENCES users(id),
  -- Snapshot of the candidate reviews offered at request time (so the UI can
  -- show "asked to choose between: ..." even after the sender's own pending
  -- reviews change) — [{ reviewId, projectLabel, reviewLabel }].
  ADD COLUMN clarification_candidates  jsonb,
  -- The sender's reply, once it arrives. Left null while status is
  -- 'awaiting_clarification'; populated by the webhook, which also flips the
  -- row back to 'pending' so it reappears for the admin to actually resolve.
  ADD COLUMN clarification_reply_text  text;

CREATE INDEX inbound_email_queue_clarification_token_idx ON inbound_email_queue(clarification_token);
