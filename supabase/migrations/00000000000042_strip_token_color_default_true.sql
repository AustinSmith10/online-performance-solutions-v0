-- Change default so new projects strip red token colour (black text) by default.
-- Backfill existing projects that still carry the old false default.
ALTER TABLE projects ALTER COLUMN strip_token_color SET DEFAULT true;
UPDATE projects SET strip_token_color = true WHERE strip_token_color = false;
