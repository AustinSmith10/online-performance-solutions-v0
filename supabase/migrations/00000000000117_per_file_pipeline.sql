-- #115: Real-time per-file verification/extraction pipeline.
--
-- Verification settled-state is derived from the existing #113 columns plus
-- this one new timestamp, rather than a redundant enum: not-started/running
-- = verification_completed_at IS NULL; clean = completed + mismatch_reasons
-- NULL; flagged-pending = completed + mismatch_reasons NOT NULL + confirmed_at
-- NULL; confirmed = completed + mismatch_reasons NOT NULL + confirmed_at NOT
-- NULL.
--
-- Extraction gets its own independent status because it only applies to
-- extraction=true slots and Continue-gating needs to block on "still
-- running" even when nothing was flagged — a dimension verification's
-- columns can't express. extraction_result caches this file's own
-- SingleDocResult-shaped contribution so the Continue-time merge step reads
-- it back with zero further LLM calls.
ALTER TABLE project_files
  ADD COLUMN IF NOT EXISTS verification_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (extraction_status IN ('not_applicable', 'pending', 'running', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS extraction_result jsonb,
  ADD COLUMN IF NOT EXISTS extraction_error text;
