-- Issue #171: enforce the six-digit project-number format at the DB level.
--
-- The valid format is exactly six digits (`^\d{6}$`); the "-S" discipline
-- suffix seen in the UI is appended by the app to generated document names
-- and is never stored. Project-number entry previously validated only
-- "non-empty" on both the admin and consultant paths, so letters, symbols,
-- and over-long strings all saved.
--
-- The two legacy `NNNN-NNN` numbers in production (`2113-163`, `2116-037`)
-- are allowlisted directly in the CHECK — not just left un-scanned via
-- NOT VALID. Postgres re-evaluates even a NOT VALID CHECK on any UPDATE that
-- touches the constrained column, so without the allowlist an admin could
-- not re-save one of those two projects' numbers through the form (the app
-- validator in lib/projects/project-number.ts grandfathers the same two
-- values, so the two layers must agree).
--
-- NOT VALID is still used so the constraint-creation step skips the one-time
-- full-table scan; every new INSERT/UPDATE is enforced. Running
-- `VALIDATE CONSTRAINT` later is safe now (the allowlist covers the legacy
-- rows) but unnecessary.
--
-- Duplicates remain allowed by design (same number across disciplines/sites)
-- — the UI shows a non-blocking warning, there is no unique index here.

ALTER TABLE projects
  ADD CONSTRAINT projects_project_number_format_check
  CHECK (
    project_number IS NULL
    OR project_number ~ '^\d{6}$'
    OR project_number IN ('2113-163', '2116-037')
  )
  NOT VALID;
