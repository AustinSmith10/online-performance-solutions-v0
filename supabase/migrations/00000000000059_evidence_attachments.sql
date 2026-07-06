-- ─── Evidence-attachment primitive (#57) ───────────────────────────────────────
-- project_files.reference optionally links an attachment to a specific field or
-- decision context (e.g. a token name being resolved). Nullable — general
-- correspondence capture has no specific reference.

ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS reference text;
