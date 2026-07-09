-- Issue #51 follow-up: let an admin pick which of the client's templates to
-- pick match/output tokens from when configuring auto-fill, rather than a
-- token list deduped across all of the client's templates. Purely an admin
-- UI filtering aid — resolution at submission time still matches by token
-- name regardless of which template a given project uses.

ALTER TABLE client_metrics_tables
  ADD COLUMN template_id uuid REFERENCES templates(id) ON DELETE SET NULL;
