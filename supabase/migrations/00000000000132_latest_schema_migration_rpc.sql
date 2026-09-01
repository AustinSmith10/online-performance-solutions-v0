-- Issue #167: expose the applied-migration high-water mark so the app can
-- refuse to serve against a schema older than the build expects.
--
-- `supabase_migrations.schema_migrations` lives outside the `public` schema,
-- so PostgREST (and therefore supabase-js `.from()`) can't read it directly.
-- This SECURITY DEFINER function returns the latest applied migration
-- `version` (the numeric filename prefix the Supabase CLI records), which the
-- boot-time drift guard in lib/schema/drift-guard.ts compares against the
-- latest migration the build ships.

CREATE OR REPLACE FUNCTION latest_schema_migration()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(version) FROM supabase_migrations.schema_migrations;
$$;

REVOKE EXECUTE ON FUNCTION latest_schema_migration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION latest_schema_migration() TO service_role;
