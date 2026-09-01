-- Issue #169: make lowercase the enforced canonical form for email.
--
-- Email is compared case-insensitively across the app (migration
-- 00000000000125's own note: "match how every existing lookup already
-- compares") but was stored with mixed case — `users.email` held values
-- like `Trishan.T@ops.test`; `dispatchPbdb` lowercased `stakeholder_email`
-- on write while the portal and `getStakeholderReviewedProjectIds` read it
-- raw. One query away from resurfacing the UAT outage signature.
--
-- Preconditions verified clean: no rows collide under lower() in any of the
-- three columns, so the UPDATEs below cannot violate a unique index
-- (users_email_lower_key is already on lower(email), so it is unaffected).

-- 1. Normalise every existing value.
UPDATE users
  SET email = lower(email)
  WHERE email <> lower(email);

UPDATE stakeholders
  SET email = lower(email)
  WHERE email <> lower(email);

UPDATE stakeholder_reviews
  SET stakeholder_email = lower(stakeholder_email)
  WHERE stakeholder_email <> lower(stakeholder_email);

-- 2. Lock the columns to lowercase-only. Plain (validated) CHECKs — the
--    UPDATEs above guarantee the existing rows pass, and every write path
--    also lowercases in application code as defence in depth.
ALTER TABLE users
  ADD CONSTRAINT users_email_lowercase_check
  CHECK (email = lower(email));

ALTER TABLE stakeholders
  ADD CONSTRAINT stakeholders_email_lowercase_check
  CHECK (email = lower(email));

ALTER TABLE stakeholder_reviews
  ADD CONSTRAINT stakeholder_reviews_email_lowercase_check
  CHECK (stakeholder_email = lower(stakeholder_email));
