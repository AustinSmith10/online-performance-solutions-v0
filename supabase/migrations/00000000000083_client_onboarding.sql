-- Per-user flag for whether a client has dismissed the first-run intro
-- banner on the client portal dashboard (issue #94). Separate from
-- onboarding_steps_seen (00000000000079) — the client portal shows one
-- static banner, not a multi-step tour, so a single boolean is enough.
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_seen_client_onboarding boolean NOT NULL DEFAULT false;

-- Existing clients aren't "first-time" users — backfill them to seen so the
-- banner only appears for genuinely new signups going forward.
UPDATE users SET has_seen_client_onboarding = true WHERE role = 'stakeholder';
