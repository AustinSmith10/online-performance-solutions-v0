-- Migration: Rename templates.org_id → client_id (missed in migration 055)
ALTER TABLE templates RENAME COLUMN org_id TO client_id;
