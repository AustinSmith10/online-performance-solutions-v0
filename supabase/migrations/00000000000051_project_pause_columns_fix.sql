-- Migration 039 was recorded as applied but the column DDL did not execute.
-- This migration re-applies the missing columns idempotently.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS paused_at               timestamptz,
  ADD COLUMN IF NOT EXISTS paused_previous_status  text,
  ADD COLUMN IF NOT EXISTS pause_reason            text;
