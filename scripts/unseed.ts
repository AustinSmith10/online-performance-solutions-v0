/**
 * Removes all data inserted by supabase/seed.ts and scripts/seed-*.ts.
 *
 * Uses DATABASE_URL (direct Postgres connection) because audit_log has an
 * immutable trigger (fires for ALL roles, including service_role) that blocks
 * DELETEs and UPDATEs. We temporarily disable it exactly as purge_project does.
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/unseed.ts
 */

import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

function resolveConnectionUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbPassword  = process.env.SUPABASE_DB_PASSWORD;

  if (supabaseUrl && dbPassword) {
    const ref  = supabaseUrl.replace(/^https?:\/\//, "").replace(/\.supabase\.co.*$/, "");
    const host = `db.${ref}.supabase.co`;
    const pw   = encodeURIComponent(dbPassword);
    console.log(`Using derived connection: db.${ref}.supabase.co:5432`);
    return `postgresql://postgres:${pw}@${host}:5432/postgres`;
  }

  console.error(
    "No database connection configured.\n\n" +
    "Option A — add the full URI:\n" +
    "  DATABASE_URL=postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres\n\n" +
    "Option B — add just the password (host is auto-derived from NEXT_PUBLIC_SUPABASE_URL):\n" +
    "  SUPABASE_DB_PASSWORD=[password]\n\n" +
    "Find it: Supabase dashboard → your project → Settings → Database → Database password"
  );
  process.exit(1);
}

const DATABASE_URL = resolveConnectionUrl();

// ── Seed manifests ────────────────────────────────────────────────────────────

const SEEDED_EMAILS = [
  "admin@ops.test",
  "consultant@ops.test",
  "consultant2@ops.test",
  "consultant3@ops.test",
  "consultant4@ops.test",
  "consultant5@ops.test",
  "client@ops.test",
  "client2@ops.test",
  "client3@ops.test",
  "client4@ops.test",
  "client5@ops.test",
];

const SEEDED_PROJECT_NUMBERS = [
  // supabase/seed.ts — main
  "OPS-0001", "OPS-0002", "OPS-0003", "OPS-0004", "OPS-0005",
  "OPS-0010", "OPS-0011", "OPS-0012",
  "OPS-R001", "OPS-R002", "OPS-R003", "OPS-R004", "OPS-R005",
  // scripts/seed-dashboard.ts
  "OPS-D001", "OPS-D002", "OPS-D003",
  // scripts/seed-consultant-view.ts
  "SEED-CV-01", "SEED-CV-02", "SEED-CV-03",
];

const SEEDED_ORG_SLUGS = ["stockland", "meridian-group"];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const db = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await db.connect();
  console.log("Connected to database.\n");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Resolve IDs ─────────────────────────────────────────────────────────────

  const { rows: projRows } = await db.query<{ id: string; project_number: string }>(
    "SELECT id, project_number FROM projects WHERE project_number = ANY($1)",
    [SEEDED_PROJECT_NUMBERS]
  );
  const projectIds = projRows.map((r) => r.id);
  console.log(`Seeded projects  : ${projRows.length} (${projRows.map((r) => r.project_number).join(", ")})`);

  const { rows: userRows } = await db.query<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE email = ANY($1)",
    [SEEDED_EMAILS]
  );
  const userIds = userRows.map((r) => r.id);
  console.log(`Seeded users     : ${userRows.length} (${userRows.map((r) => r.email).join(", ")})`);

  const { rows: orgRows } = await db.query<{ id: string; slug: string }>(
    "SELECT id, slug FROM organisations WHERE slug = ANY($1)",
    [SEEDED_ORG_SLUGS]
  );
  const orgIds = orgRows.map((r) => r.id);
  console.log(`Seeded orgs      : ${orgRows.length} (${orgRows.map((r) => r.slug).join(", ")})`);

  if (projectIds.length === 0 && userIds.length === 0 && orgIds.length === 0) {
    console.log("\nNothing to remove — seed data not found.");
    await db.end();
    return;
  }

  console.log("\nStarting removal...\n");

  // ── Database transaction ─────────────────────────────────────────────────────

  await db.query("BEGIN");
  try {

    // Disable audit_log triggers for this transaction (same pattern as purge_project).
    await db.query("ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update");
    await db.query("ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_delete");

    // ── 1. Leaf rows on projects ─────────────────────────────────────────────
    if (projectIds.length > 0) {
      const { rowCount: sr } = await db.query(
        "DELETE FROM stakeholder_reviews WHERE project_id = ANY($1)", [projectIds]
      );
      console.log(`  stakeholder_reviews    : ${sr} deleted`);

      const { rowCount: pf } = await db.query(
        "DELETE FROM project_files WHERE project_id = ANY($1)", [projectIds]
      );
      console.log(`  project_files          : ${pf} deleted`);

      // credit_ledger.project_id has no ON DELETE action — null it before project deletion
      await db.query(
        "UPDATE credit_ledger SET project_id = NULL WHERE project_id = ANY($1)", [projectIds]
      );
    }

    // ── 2. Notifications ─────────────────────────────────────────────────────
    if (userIds.length > 0) {
      const { rowCount: nu } = await db.query(
        "DELETE FROM notifications WHERE recipient_id = ANY($1)", [userIds]
      );
      console.log(`  notifications (user)   : ${nu} deleted`);
    }
    if (projectIds.length > 0) {
      const { rowCount: np } = await db.query(
        "DELETE FROM notifications WHERE project_id = ANY($1)", [projectIds]
      );
      if ((np ?? 0) > 0) console.log(`  notifications (proj)   : ${np} deleted`);
    }

    // ── 3. audit_log (triggers disabled — safe to delete) ───────────────────
    if (userIds.length > 0) {
      const { rowCount: alu } = await db.query(
        "DELETE FROM audit_log WHERE actor_id = ANY($1)", [userIds]
      );
      console.log(`  audit_log (actor)      : ${alu} deleted`);
    }
    if (projectIds.length > 0) {
      const { rowCount: alp } = await db.query(
        "DELETE FROM audit_log WHERE project_id = ANY($1)", [projectIds]
      );
      if ((alp ?? 0) > 0) console.log(`  audit_log (project)    : ${alp} deleted`);
    }
    if (orgIds.length > 0) {
      const { rowCount: alo } = await db.query(
        "DELETE FROM audit_log WHERE org_id = ANY($1)", [orgIds]
      );
      if ((alo ?? 0) > 0) console.log(`  audit_log (org)        : ${alo} deleted`);
    }
    const { rowCount: als } = await db.query(
      "DELETE FROM audit_log WHERE event_type = 'audit.seed'"
    );
    if ((als ?? 0) > 0) console.log(`  audit_log (sentinel)   : ${als} deleted`);

    // ── 4. credit_ledger (org_id NOT NULL — must go before org deletion) ─────
    if (orgIds.length > 0) {
      const { rowCount: cl } = await db.query(
        "DELETE FROM credit_ledger WHERE org_id = ANY($1)", [orgIds]
      );
      console.log(`  credit_ledger          : ${cl} deleted`);
    }

    // ── 5. Projects ──────────────────────────────────────────────────────────
    // Null FK columns on non-seeded projects that point at seeded users
    // (assigned_consultant_id, payment_override_by have no ON DELETE action)
    if (userIds.length > 0) {
      await db.query(
        `UPDATE projects
           SET assigned_consultant_id = NULL
         WHERE assigned_consultant_id = ANY($1)
           AND id != ALL($2::uuid[])`,
        [userIds, projectIds.length > 0 ? projectIds : []]
      );
      await db.query(
        `UPDATE projects
           SET payment_override_by = NULL
         WHERE payment_override_by = ANY($1)
           AND id != ALL($2::uuid[])`,
        [userIds, projectIds.length > 0 ? projectIds : []]
      );
    }

    if (projectIds.length > 0) {
      const { rowCount: pr } = await db.query(
        "DELETE FROM projects WHERE id = ANY($1)", [projectIds]
      );
      console.log(`  projects               : ${pr} deleted`);
    }

    // ── 6. Templates (cascade deletes template_field_mappings, file_requirements,
    //        stakeholder_configs)
    if (orgIds.length > 0) {
      const { rowCount: tm } = await db.query(
        "DELETE FROM templates WHERE org_id = ANY($1)", [orgIds]
      );
      console.log(`  templates (+cascade)   : ${tm} deleted`);
    }

    // ── 7. public.users ──────────────────────────────────────────────────────
    if (userIds.length > 0) {
      const { rowCount: ur } = await db.query(
        "DELETE FROM users WHERE id = ANY($1)", [userIds]
      );
      console.log(`  public.users           : ${ur} deleted`);
    }

    // ── 8. Organisations ─────────────────────────────────────────────────────
    if (orgIds.length > 0) {
      const { rowCount: or_ } = await db.query(
        "DELETE FROM organisations WHERE id = ANY($1)", [orgIds]
      );
      console.log(`  organisations          : ${or_} deleted`);
    }

    // ── Re-enable triggers ───────────────────────────────────────────────────
    await db.query("ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update");
    await db.query("ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete");

    await db.query("COMMIT");
    console.log("\nDatabase transaction committed.");

  } catch (err) {
    await db.query("ROLLBACK");
    // Best-effort re-enable even on rollback
    await db.query("ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update").catch(() => {});
    await db.query("ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete").catch(() => {});
    throw err;
  } finally {
    await db.end();
  }

  // ── Auth users (outside transaction — Supabase Admin API call) ──────────────
  console.log("\nRemoving auth accounts...");
  const { data: allAuthData } = await supabase.auth.admin.listUsers();
  const allAuth = allAuthData as { users: Array<{ id: string; email?: string }> } | null;
  let authDeleted = 0;
  for (const email of SEEDED_EMAILS) {
    const match = allAuth?.users.find((u) => u.email === email);
    if (match) {
      const { error } = await supabase.auth.admin.deleteUser(match.id);
      if (error) {
        console.error(`  ✗ ${email}: ${error.message}`);
      } else {
        console.log(`  ✓ ${email}`);
        authDeleted++;
      }
    }
  }
  console.log(`  auth.users removed: ${authDeleted}`);

  console.log("\n=== Unseed complete ===");
}

main().catch((err) => {
  console.error("\nUnseed failed:", err.message ?? err);
  process.exit(1);
});
