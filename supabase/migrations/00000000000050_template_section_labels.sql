ALTER TABLE templates
  ADD COLUMN section_labels jsonb NOT NULL DEFAULT '{
    "extract": "Extracted from your documents",
    "org": "Organisation details",
    "client": "Additional information"
  }'::jsonb;
