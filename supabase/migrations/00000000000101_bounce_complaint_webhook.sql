-- Bounce/complaint webhook (closes the stub left by 00000000000065): lets
-- app/api/webhooks/email-bounce correlate a Postmark Bounce/SpamComplaint
-- event back to the send that triggered it, and distinguishes the two event
-- kinds for the admin "hard system errors" chit.

ALTER TABLE email_send_log ADD COLUMN message_id text;
CREATE INDEX email_send_log_message_id_idx ON email_send_log(message_id) WHERE message_id IS NOT NULL;

ALTER TABLE bounce_events ADD COLUMN type text NOT NULL DEFAULT 'bounce' CHECK (type IN ('bounce', 'complaint'));
ALTER TABLE bounce_events ADD COLUMN message_id text;
