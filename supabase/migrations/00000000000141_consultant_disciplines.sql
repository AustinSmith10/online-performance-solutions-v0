-- Discipline(s) per consultant.
--
-- Restricts which projects a consultant can self-assign or be assigned to:
-- a project's discipline is its template's `number_suffix` (migration
-- 00000000000140); a consultant may only take a project whose discipline is
-- in their own `disciplines` set. A consultant can cover more than one
-- discipline (Fire + Acoustics, etc.), so this is an array, not a single
-- letter like the template column.
--
-- Same fixed six letters as templates.number_suffix — F Fire, S Solutions,
-- D Access, A Acoustics, E ESD, C Code (lib/projects/project-number.ts's
-- DISCIPLINES is the single source of truth for the mapping; keep this
-- CHECK in sync with it).
--
-- Nullable, no default: expand only, per docs/adr/0001. The currently-running
-- app version doesn't know this column exists, so a NOT NULL default here
-- would be safe for inserts either way (Postgres applies a default to
-- existing rows without a rewrite) — but the app now *requires* every new
-- consultant account to pick at least one discipline at creation time, so
-- going forward NULL only means "not tagged yet" for accounts that predate
-- this migration, which the data backfill below resolves immediately.
--
-- The CHECK is NOT VALID (skips the one-time full-table scan) and, once
-- non-null, requires at least one letter, all of them from the fixed set.
-- Server-side enforcement of "consultant can only take matching work" lives
-- in lib/projects/assign.ts's performAssignment, not here — this column is
-- data, not the access-control decision itself.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS disciplines text[];

ALTER TABLE users
  ADD CONSTRAINT users_disciplines_format
  CHECK (
    disciplines IS NULL
    OR (cardinality(disciplines) > 0 AND disciplines <@ ARRAY['F', 'S', 'D', 'A', 'E', 'C'])
  )
  NOT VALID;

-- Legacy consultants (everyone before this migration) default to Solutions —
-- the only discipline OPS has ever actually run in production.
UPDATE users
SET disciplines = ARRAY['S']
WHERE role = 'consultant'
  AND (disciplines IS NULL OR cardinality(disciplines) = 0);
