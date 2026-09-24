-- Discipline suffix per template.
--
-- The "-S" appended to a project number in document names (PBDB/PBDR
-- filenames, the PROJECT_NO token, emails) was hard-coded in the app. It is
-- really a property of the template: a client's Solutions template produces
-- "-S", a Fire template produces "-F", and so on. The project number itself
-- stays six digits, unique across all disciplines (migration
-- 00000000000135), and the suffix is still never stored on it.
--
-- One letter, drawn from OPS's fixed discipline list (see
-- lib/projects/project-number.ts's DISCIPLINES, the single source of truth
-- for the mapping — keep this CHECK in sync with it):
--   F Fire, S Solutions, D Access, A Acoustics, E ESD, C Code
--
-- Existing templates read 'S' via the column default, which Postgres applies
-- to existing rows without a rewrite, so nothing changes for current
-- projects. Expand only: nullable column, CHECK added NOT VALID; the app
-- treats NULL as 'S'. NOT NULL / VALIDATE can follow in a later contract
-- migration once this code is fully live.

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS number_suffix text DEFAULT 'S';

ALTER TABLE templates
  ADD CONSTRAINT templates_number_suffix_format
  CHECK (number_suffix IS NULL OR number_suffix IN ('F', 'S', 'D', 'A', 'E', 'C'))
  NOT VALID;
