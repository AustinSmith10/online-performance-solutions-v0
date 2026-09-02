-- ─── widen the `templates` bucket MIME allow-list to include PDF ────────────
--
-- The bucket was created (migration 9) accepting only .docx. Two features now
-- also write PDFs into it:
--   * reference samples for file requirements (#115) — already shipping code
--     in app/actions/file-requirements.ts uploads `application/pdf` here;
--   * the template previewer, which renders the working .docx to PDF and
--     caches it at `{client_id}/{templateId}/preview.pdf`.
-- Without this, both fail with "mime type application/pdf is not supported".
--
-- Expand-only: widening an allow-list never breaks the currently-running app
-- version (every upload it already makes stays valid).

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf'
]
WHERE id = 'templates';
