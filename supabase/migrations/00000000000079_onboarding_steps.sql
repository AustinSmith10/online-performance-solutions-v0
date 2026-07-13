-- Supersedes 00000000000078_onboarding_seen.sql: a single "seen" boolean
-- can't represent the onboarding tour once steps complete independently
-- and asynchronously (some fire immediately, some are deferred until the
-- user is actually in that situation for the first time).
ALTER TABLE users DROP COLUMN IF EXISTS has_seen_onboarding;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_steps_seen text[] NOT NULL DEFAULT '{}';
