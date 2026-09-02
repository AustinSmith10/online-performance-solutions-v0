/**
 * The latest migration this build expects to be applied to the database.
 *
 * MUST equal the numeric prefix of the highest-numbered file in
 * `supabase/migrations/`. CI (`.github/workflows/ci.yml` → "Schema/type
 * drift") fails the PR if the two disagree, so this can't silently rot — but
 * you still have to bump it in the same commit as a new migration.
 *
 * The boot-time drift guard (lib/schema/drift-guard.ts) compares this against
 * `latest_schema_migration()` on the remote: if the DB is behind, ops-web's
 * healthcheck goes red and ops-worker refuses to start, turning a silent
 * `PGRST204` into an immediately-visible failed deploy (#167).
 */
export const EXPECTED_SCHEMA_MIGRATION = "00000000000134";
