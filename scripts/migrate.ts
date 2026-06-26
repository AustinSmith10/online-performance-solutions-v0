/**
 * Applies all pending migrations to the Supabase cloud database.
 *
 * Connection options (in priority order):
 *   1. DATABASE_URL — full Postgres URI (Supabase dashboard → Settings → Database → URI)
 *   2. SUPABASE_DB_PASSWORD — just the database password; the host is derived from
 *      NEXT_PUBLIC_SUPABASE_URL automatically (format: db.[ref].supabase.co)
 */
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";

function resolveConnectionUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbPassword  = process.env.SUPABASE_DB_PASSWORD;

  if (supabaseUrl && dbPassword) {
    // https://[ref].supabase.co  →  db.[ref].supabase.co
    const ref  = supabaseUrl.replace(/^https?:\/\//, "").replace(/\.supabase\.co.*$/, "");
    const host = `db.${ref}.supabase.co`;
    const pw   = encodeURIComponent(dbPassword);
    console.log(`Using derived connection: db.${ref}.supabase.co:5432`);
    return `postgresql://postgres:${pw}@${host}:5432/postgres`;
  }

  console.error(
    "No database connection configured.\n\n" +
    "Option A — add the full URI to .env.local:\n" +
    "  DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres\n\n" +
    "Option B — add just the database password (host is auto-derived from NEXT_PUBLIC_SUPABASE_URL):\n" +
    "  SUPABASE_DB_PASSWORD=[password]\n\n" +
    "Find the password: Supabase dashboard → your project → Settings → Database → Database password"
  );
  process.exit(1);
}

const url = resolveConnectionUrl();

async function run() {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected to database.");

  // Ensure migrations tracking table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const migrationsDir = join(process.cwd(), "supabase/migrations");
  const { readdirSync } = await import("fs");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: applied } = await client.query(
    "SELECT name FROM _migrations"
  );
  const appliedSet = new Set(applied.map((r: { name: string }) => r.name));

  let ran = 0;
  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`  skip  ${file}`);
      continue;
    }
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    console.log(`  apply ${file} …`);
    await client.query(sql);
    await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    console.log(`  done  ${file}`);
    ran++;
  }

  await client.end();
  console.log(`\nMigration complete. ${ran} file(s) applied.`);
}

run().catch((err) => {
  console.error("Migration failed:", err.message);
  process.exit(1);
});
