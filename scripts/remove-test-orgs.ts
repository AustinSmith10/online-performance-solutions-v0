/**
 * Removes manually-created test organisations: "org2", "Test Org QA", "Meridian Group".
 *
 * Run with:
 *   npx tsx --env-file=.env.local scripts/remove-test-orgs.ts
 */

import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}

function resolveConnectionUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const dbPassword  = process.env.SUPABASE_DB_PASSWORD;
  if (dbPassword) {
    const ref = supabaseUrl.replace(/^https?:\/\//, "").replace(/\.supabase\.co.*$/, "");
    const pw  = encodeURIComponent(dbPassword);
    console.log(`Using derived connection: db.${ref}.supabase.co:5432`);
    return `postgresql://postgres:${pw}@db.${ref}.supabase.co:5432/postgres`;
  }
  console.error("No DATABASE_URL or SUPABASE_DB_PASSWORD found in .env.local");
  process.exit(1);
}

const TARGET_ORG_NAMES = ["org2", "Test Org QA", "Meridian Group"];

async function main() {
  const db = new Client({ connectionString: resolveConnectionUrl(), ssl: { rejectUnauthorized: false } });
  await db.connect();
  console.log("Connected.\n");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── Resolve IDs ──────────────────────────────────────────────────────────────

  const { rows: orgRows } = await db.query<{ id: string; name: string; slug: string }>(
    "SELECT id, name, slug FROM organisations WHERE name = ANY($1) ORDER BY name",
    [TARGET_ORG_NAMES]
  );
  if (orgRows.length === 0) {
    console.log("None of the target orgs found — nothing to do.");
    await db.end();
    return;
  }
  const orgIds = orgRows.map((r) => r.id);
  console.log(`Target orgs (${orgRows.length}):`);
  for (const r of orgRows) console.log(`  ${r.name} (slug: ${r.slug}, id: ${r.id})`);

  const { rows: projRows } = await db.query<{ id: string; project_number: string }>(
    "SELECT id, project_number FROM projects WHERE org_id = ANY($1)",
    [orgIds]
  );
  const projectIds = projRows.map((r) => r.id);
  console.log(`\nProjects    : ${projRows.length}${projRows.length ? " (" + projRows.map((r) => r.project_number).join(", ") + ")" : ""}`);

  const { rows: userRows } = await db.query<{ id: string; email: string }>(
    "SELECT id, email FROM users WHERE org_id = ANY($1)",
    [orgIds]
  );
  const userIds = userRows.map((r) => r.id);
  console.log(`Users       : ${userRows.length}${userRows.length ? " (" + userRows.map((r) => r.email).join(", ") + ")" : ""}`);

  console.log("\nStarting removal...\n");

  await db.query("BEGIN");
  try {
    await db.query("ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update");
    await db.query("ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_delete");

    if (projectIds.length > 0) {
      const { rowCount: sr } = await db.query("DELETE FROM stakeholder_reviews WHERE project_id = ANY($1)", [projectIds]);
      console.log(`  stakeholder_reviews    : ${sr} deleted`);
      const { rowCount: pf } = await db.query("DELETE FROM project_files WHERE project_id = ANY($1)", [projectIds]);
      console.log(`  project_files          : ${pf} deleted`);
      await db.query("UPDATE credit_ledger SET project_id = NULL WHERE project_id = ANY($1)", [projectIds]);
    }

    if (userIds.length > 0) {
      const { rowCount: nu } = await db.query("DELETE FROM notifications WHERE recipient_id = ANY($1)", [userIds]);
      console.log(`  notifications (user)   : ${nu} deleted`);
    }
    if (projectIds.length > 0) {
      const { rowCount: np } = await db.query("DELETE FROM notifications WHERE project_id = ANY($1)", [projectIds]);
      if ((np ?? 0) > 0) console.log(`  notifications (proj)   : ${np} deleted`);
    }

    if (userIds.length > 0) {
      const { rowCount: alu } = await db.query("DELETE FROM audit_log WHERE actor_id = ANY($1)", [userIds]);
      console.log(`  audit_log (actor)      : ${alu} deleted`);
    }
    if (projectIds.length > 0) {
      const { rowCount: alp } = await db.query("DELETE FROM audit_log WHERE project_id = ANY($1)", [projectIds]);
      if ((alp ?? 0) > 0) console.log(`  audit_log (project)    : ${alp} deleted`);
    }
    const { rowCount: alo } = await db.query("DELETE FROM audit_log WHERE org_id = ANY($1)", [orgIds]);
    if ((alo ?? 0) > 0) console.log(`  audit_log (org)        : ${alo} deleted`);

    const { rowCount: cl } = await db.query("DELETE FROM credit_ledger WHERE org_id = ANY($1)", [orgIds]);
    console.log(`  credit_ledger          : ${cl} deleted`);

    if (userIds.length > 0 && projectIds.length > 0) {
      await db.query(
        "UPDATE projects SET assigned_consultant_id = NULL WHERE assigned_consultant_id = ANY($1) AND id != ALL($2::uuid[])",
        [userIds, projectIds]
      );
      await db.query(
        "UPDATE projects SET payment_override_by = NULL WHERE payment_override_by = ANY($1) AND id != ALL($2::uuid[])",
        [userIds, projectIds]
      );
    }

    if (projectIds.length > 0) {
      const { rowCount: pr } = await db.query("DELETE FROM projects WHERE id = ANY($1)", [projectIds]);
      console.log(`  projects               : ${pr} deleted`);
    }

    const { rowCount: tm } = await db.query("DELETE FROM templates WHERE org_id = ANY($1)", [orgIds]);
    console.log(`  templates (+cascade)   : ${tm} deleted`);

    if (userIds.length > 0) {
      const { rowCount: ur } = await db.query("DELETE FROM users WHERE id = ANY($1)", [userIds]);
      console.log(`  public.users           : ${ur} deleted`);
    }

    const { rowCount: or_ } = await db.query("DELETE FROM organisations WHERE id = ANY($1)", [orgIds]);
    console.log(`  organisations          : ${or_} deleted`);

    await db.query("ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update");
    await db.query("ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete");

    await db.query("COMMIT");
    console.log("\nDatabase transaction committed.");
  } catch (err) {
    await db.query("ROLLBACK");
    await db.query("ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update").catch(() => {});
    await db.query("ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_delete").catch(() => {});
    throw err;
  } finally {
    await db.end();
  }

  // ── Auth users ───────────────────────────────────────────────────────────────
  if (userIds.length > 0) {
    console.log("\nRemoving auth accounts...");
    const { data: allAuthData } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    const allAuth = (allAuthData as { users: Array<{ id: string; email?: string }> } | null)?.users ?? [];
    const targetEmails = new Set(userRows.map((r) => r.email));
    let authDeleted = 0;
    for (const u of allAuth) {
      if (u.email && targetEmails.has(u.email)) {
        const { error } = await supabase.auth.admin.deleteUser(u.id);
        if (error) {
          console.error(`  ✗ ${u.email}: ${error.message}`);
        } else {
          console.log(`  ✓ ${u.email}`);
          authDeleted++;
        }
      }
    }
    console.log(`  auth.users removed: ${authDeleted}`);
  }

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("\nFailed:", err.message ?? err);
  process.exit(1);
});
