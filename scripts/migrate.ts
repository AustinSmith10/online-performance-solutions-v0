/**
 * Applies all pending migrations to the Supabase cloud database.
 * Requires DATABASE_URL in .env.local (get from Supabase dashboard → Settings → Database).
 */
import { readFileSync } from "fs";
import { join } from "path";
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(
    "DATABASE_URL is not set.\n\n" +
    "Get it from: Supabase dashboard → your project → Settings → Database → Connection string → URI\n" +
    "Then add it to .env.local:\n  DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
  );
  process.exit(1);
}

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
