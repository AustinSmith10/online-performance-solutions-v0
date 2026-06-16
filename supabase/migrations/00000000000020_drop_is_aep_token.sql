-- Remove is_aep_token — rainfall is handled by the standard extraction hint
ALTER TABLE template_field_mappings
  DROP COLUMN IF EXISTS is_aep_token;
