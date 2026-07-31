-- The client-portal onboarding banner (has_seen_client_onboarding, #94) is
-- replaced by the same spotlight-tour mechanism admin/consultant already use
-- (onboarding_steps_seen, #90) — see STAKEHOLDER_TOUR_STEPS in
-- lib/onboarding/steps.ts. The boolean has no remaining readers.
ALTER TABLE users DROP COLUMN IF EXISTS has_seen_client_onboarding;
