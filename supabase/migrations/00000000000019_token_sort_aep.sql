-- Add sort_order for client-facing field ordering and is_aep_token for halcyon AEP lookup
ALTER TABLE template_field_mappings
  ADD COLUMN sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN is_aep_token boolean NOT NULL DEFAULT false;
