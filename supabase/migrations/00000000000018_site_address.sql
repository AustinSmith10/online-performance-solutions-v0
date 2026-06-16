ALTER TABLE projects
  ADD COLUMN site_address text;

ALTER TABLE template_field_mappings
  ADD COLUMN is_address_token boolean NOT NULL DEFAULT false;
