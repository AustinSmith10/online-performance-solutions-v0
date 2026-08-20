-- Issue #150: Security — webhook idempotency (Postmark dedupe).
--
-- Both Postmark webhook handlers (app/api/webhooks/email/route.ts,
-- app/api/webhooks/email-bounce/route.ts) do real work — storage upload, DB
-- insert, outbound reply — before returning 200, with no dedupe against
-- message_id. Postmark retries on non-2xx or a slow response, which without
-- these constraints would produce duplicate queue rows/attachments/
-- auto-replies.
--
-- inbound_email_queue: plain uniqueness on message_id (partial, so rows with
-- no message_id — never expected from Postmark but defensively allowed by
-- the column's nullability — don't collide with each other).
--
-- bounce_events: (message_id, type), NOT a plain message_id key — Postmark
-- sends a `Bounce` and a `SpamComplaint` event for the same MessageID (e.g. a
-- recipient who both hard-bounces and later marks as spam via a delayed
-- report), and a plain message_id unique key would silently drop the second,
-- distinct event.
--
-- NOTE: before this migration is applied to production, someone with prod DB
-- access needs to run a pre-check query for existing duplicate message_ids
-- on both tables (this cannot be verified from this sandbox) — see the
-- accompanying issue for details. If duplicates exist, they must be resolved
-- (deleted or deduped) before the unique index can be created.

CREATE UNIQUE INDEX IF NOT EXISTS inbound_email_queue_message_id_key
  ON inbound_email_queue (message_id)
  WHERE message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bounce_events_message_id_type_key
  ON bounce_events (message_id, type)
  WHERE message_id IS NOT NULL;
