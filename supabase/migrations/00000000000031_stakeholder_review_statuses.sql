-- Migrate stakeholder_reviews.status from binary acknowledged/modifications_requested
-- to four-state: approved_without_comments, approved_with_comments,
--                rejected_without_comments, rejected_with_comments

-- 1. Drop the old constraint first so the UPDATE can write new values
ALTER TABLE stakeholder_reviews
  DROP CONSTRAINT IF EXISTS stakeholder_reviews_status_check;

-- 2. Migrate existing rows
UPDATE stakeholder_reviews
SET status = CASE
  WHEN comments IS NOT NULL AND comments != '' THEN 'approved_with_comments'
  ELSE 'approved_without_comments'
END
WHERE status = 'acknowledged';

UPDATE stakeholder_reviews
SET status = CASE
  WHEN comments IS NOT NULL AND comments != '' THEN 'rejected_with_comments'
  ELSE 'rejected_without_comments'
END
WHERE status = 'modifications_requested';

-- 3. Add the new constraint
ALTER TABLE stakeholder_reviews
  ADD CONSTRAINT stakeholder_reviews_status_check
  CHECK (status IN (
    'pending',
    'approved_without_comments',
    'approved_with_comments',
    'rejected_without_comments',
    'rejected_with_comments',
    'waived'
  ));
