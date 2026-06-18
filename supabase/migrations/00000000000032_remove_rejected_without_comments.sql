-- Remove rejected_without_comments — rejections must always include a reason
ALTER TABLE stakeholder_reviews
  DROP CONSTRAINT stakeholder_reviews_status_check;

ALTER TABLE stakeholder_reviews
  ADD CONSTRAINT stakeholder_reviews_status_check
  CHECK (status IN (
    'pending',
    'approved_without_comments',
    'approved_with_comments',
    'rejected_with_comments',
    'waived'
  ));
