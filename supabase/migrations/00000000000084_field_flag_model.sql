-- Wires up field_flags (00000000000060) for real (#58): unified candidate-
-- list flag model. Adds per-token comparison strictness next to the
-- existing extraction_hint, and structured resolution metadata on
-- field_flags to record *why* a flag was resolved, not just who/when.

ALTER TABLE template_field_mappings
  ADD COLUMN comparison_mode text NOT NULL DEFAULT 'exact'
    CHECK (comparison_mode IN ('exact', 'normalized', 'semantic'));

ALTER TABLE field_flags
  ADD COLUMN resolution_reason text
    CHECK (resolution_reason IN ('self_resolved', 'resolved_for_stakeholder', 'resolved_independently')),
  ADD COLUMN resolution_note text;

-- Prerequisite fix: Stockland's CLIENT_ADDRESS token was mapped as
-- field_key='client' (manually typed), which contradicts the premise that
-- address participates in the extracted-field flag system at all. Moves it
-- to 'extract' so it gets candidate/flag coverage like every other
-- extract-type token. CLIENT_ADDRESS is specific to the Stockland template
-- naming convention (docs/stockland-template-token-mapping.md).
UPDATE template_field_mappings
SET field_key = 'extract'
WHERE placeholder_token = 'CLIENT_ADDRESS'
  AND field_key = 'client';
