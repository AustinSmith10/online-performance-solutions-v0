-- Documents attached via inbound email had their file_type guessed purely by
-- arrival position (first PDF in the first email = "purchase_order",
-- everything else = "building_drawing_plans") — breaks as soon as documents
-- arrive out of that assumed order across multiple emails.
--
-- Replaces the guess with an extraction-based suggestion (whichever
-- attachment the po_number was actually extracted from) that an
-- admin/consultant must confirm on the project's Documents panel before
-- it's treated as final. Defaults to true so existing rows (portal
-- submissions, generated PBDB/PBDR, evidence, and everything uploaded
-- before this column existed) aren't retroactively flagged for review.
ALTER TABLE project_files
  ADD COLUMN file_type_confirmed boolean NOT NULL DEFAULT true;
