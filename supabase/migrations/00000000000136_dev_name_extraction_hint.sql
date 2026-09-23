-- Issue #189: EXTRACT_DEV_NAME's extraction hint pointed the model at "the
-- header of the purchase order", but on real construction drawings the
-- development name is the "Halcyon Community" value in the title block.
-- Data-only backfill (expand-safe): only rewrites the hint where it still
-- carries the old seeded wording, so an admin-customised hint is untouched.

UPDATE template_field_mappings
SET extraction_hint =
  'The name of the Halcyon development (e.g. Halcyon Promenade, Halcyon Rise). '
  || 'On the construction drawings it is the "Halcyon Community" value in the drawing title block '
  || '— return that value exactly as printed, including any suffix such as "– West" or "Stage 2".'
WHERE placeholder_token = 'EXTRACT_DEV_NAME'
  AND (extraction_hint IS NULL OR extraction_hint ILIKE '%header of the purchase order%');
