-- Issue #98: hard gate for the inbound email webhook. The webhook now only
-- classifies an inbound email (proposed category + target) and stages it
-- here — nothing (draft creation, file filing, extraction,
-- stakeholder_reviews updates, outbound confirmation emails) happens
-- automatically anymore for the 3 real category handlers. An admin/consultant
-- approves, rejects, or reassigns each row (resolution UI lands in a later
-- issue) before the real pipeline runs against it.

CREATE TABLE inbound_email_queue (
  id                              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  received_at                     timestamptz NOT NULL DEFAULT now(),

  -- Raw email fields, captured as-is off the Postmark payload.
  from_email                      text NOT NULL,
  from_name                       text,
  subject                         text,
  message_id                      text,
  mailbox_hash                    text,
  text_body                       text,
  stripped_reply_text             text,
  -- [{ path, filename, content_type }] — objects live under the
  -- `pending-inbound` storage bucket, keyed by this row's id.
  attachment_paths                jsonb NOT NULL DEFAULT '[]',

  -- Classification, set at intake by the webhook.
  proposed_category               text NOT NULL
    CHECK (proposed_category IN ('new_submission', 'thread_reply', 'stakeholder_response')),
  proposed_project_id             uuid REFERENCES projects(id),
  proposed_stakeholder_review_id  uuid REFERENCES stakeholder_reviews(id),
  match_reason                    text NOT NULL
    CHECK (match_reason IN ('token_match', 'mailbox_hash_projectid_match', 'stakeholder_table_fallback', 'no_match')),

  -- Resolution, set later by an admin/consultant.
  status                          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  resolved_category               text
    CHECK (resolved_category IN ('new_submission', 'thread_reply', 'stakeholder_response')),
  resolved_project_id             uuid REFERENCES projects(id),
  resolved_stakeholder_review_id  uuid REFERENCES stakeholder_reviews(id),
  resolved_by                     uuid REFERENCES users(id),
  resolved_at                     timestamptz,
  rejection_reason                text,

  created_at                      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX inbound_email_queue_status_idx ON inbound_email_queue(status);
CREATE INDEX inbound_email_queue_proposed_project_idx ON inbound_email_queue(proposed_project_id);

ALTER TABLE inbound_email_queue ENABLE ROW LEVEL SECURITY;

-- Visible to everyone but client/stakeholder-portal roles (per design decision).
CREATE POLICY "Admins and consultants can view the inbound email queue" ON inbound_email_queue
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin', 'consultant'));

CREATE POLICY "Service role full access to inbound email queue" ON inbound_email_queue
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─── pending-inbound storage bucket ────────────────────────────────────────
-- Attachments for a queued (not-yet-approved) email land here, not the final
-- submissions/evidence path — nothing is filed against a real project until
-- an admin approves the queue row.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pending-inbound',
  'pending-inbound',
  false,
  52428800,  -- 50 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/tiff'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins and consultants can read pending inbound attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'pending-inbound'
    AND (auth.jwt() ->> 'app_role')::text IN ('super_admin', 'admin', 'consultant')
  );

CREATE POLICY "Service role full access to pending inbound storage" ON storage.objects
  FOR ALL
  USING (bucket_id = 'pending-inbound' AND auth.role() = 'service_role')
  WITH CHECK (bucket_id = 'pending-inbound' AND auth.role() = 'service_role');
