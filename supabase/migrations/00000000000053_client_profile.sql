-- Add client profile visibility and ordering to template_field_mappings.
-- client_visible: whether this token appears on the client-facing project page.
-- client_sort_order: display order on the client profile (independent of the template token order).

ALTER TABLE template_field_mappings
  ADD COLUMN client_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN client_sort_order int NOT NULL DEFAULT 0;

-- Seed client_sort_order from the existing sort_order for all current rows
-- so existing templates don't need to be reconfigured.
UPDATE template_field_mappings SET client_sort_order = sort_order WHERE client_sort_order = 0;
