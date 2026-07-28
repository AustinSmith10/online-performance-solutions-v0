-- Migration: Rename leftover *_org_id_fkey constraint names to *_client_id_fkey
-- Cosmetic-only cleanup following the org_id → client_id rename in migration 055.
-- Postgres doesn't auto-rename constraints when a referencing column is renamed,
-- so these constraint names were left stale even though the columns are correct.

ALTER TABLE audit_log     RENAME CONSTRAINT audit_log_org_id_fkey     TO audit_log_client_id_fkey;
ALTER TABLE credit_ledger RENAME CONSTRAINT credit_ledger_org_id_fkey TO credit_ledger_client_id_fkey;
ALTER TABLE projects      RENAME CONSTRAINT projects_org_id_fkey      TO projects_client_id_fkey;
ALTER TABLE templates     RENAME CONSTRAINT templates_org_id_fkey     TO templates_client_id_fkey;
ALTER TABLE users         RENAME CONSTRAINT users_org_id_fkey         TO users_client_id_fkey;
