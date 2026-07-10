-- Per-user flag for whether they've dismissed the first-run onboarding
-- guidance shown on the consultant/admin portals.
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_seen_onboarding boolean NOT NULL DEFAULT false;
