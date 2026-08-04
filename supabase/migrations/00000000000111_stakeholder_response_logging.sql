-- Issue #111: structured detail on consultant-logged stakeholder responses —
-- how (mode), who told the consultant (respondent, may differ from the
-- review's own stakeholder), and when. responded_at (existing column)
-- doubles as the editable/backdatable response date & time for this flow.

ALTER TABLE stakeholder_reviews
  ADD COLUMN IF NOT EXISTS response_mode text CHECK (response_mode IN ('email', 'teams', 'call', 'sms')),
  ADD COLUMN IF NOT EXISTS respondent_name text;
