// Snapshots the mutable, tester-touched slice of the database so a UAT round
// can be reset back to its starting point afterwards. Run this once, right
// after seeding the 15 (or however many) baseline projects, before any
// tester touches the app.
//
// Deliberately excludes:
//   - audit_log, credit_ledger — intentionally immutable/append-only. We
//     never delete or rewind these; see the "Global Settings" / lockout
//     discussion in this UAT round for why.
//   - users, templates, stakeholders (reviewer roster), clients (structure)
//     — reference/config data, not something a tester's run creates or
//     should roll back. clients.credit_balance is the one volatile field
//     on that table, so it's captured and restored separately (a plain
//     UPDATE, not a delete/reinsert — clients has too much FK fan-out).
//
// Usage:
//   node --env-file=.env.local scripts/uat/snapshot.mjs [path]
//   (defaults to scripts/uat/snapshot.json)

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = process.argv[2] || path.join(__dirname, "snapshot.json");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Parent-first order — reset.mjs deletes in reverse and inserts in this order.
export const TABLES = [
  "projects",
  "stakeholder_reviews",
  "project_files",
  "field_flags",
  "revision_notes",
  "pending_deliveries",
  "credit_race_events",
  "bounce_events",
  "email_send_log",
  "resolved_signals",
  "notifications",
  "inbound_email_queue", // last — references both projects and stakeholder_reviews
];

async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select("*");
  if (error) throw new Error(`[snapshot] ${table}: ${error.message}`);
  return data ?? [];
}

async function main() {
  const snapshot = { takenAt: new Date().toISOString(), tables: {}, clients: [] };

  for (const table of TABLES) {
    const rows = await fetchAll(table);
    snapshot.tables[table] = rows;
    console.log(`  ${table}: ${rows.length} rows`);
  }

  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, credit_balance, credit_limit, is_frozen");
  if (clientsError) throw new Error(`[snapshot] clients: ${clientsError.message}`);
  snapshot.clients = clients ?? [];
  console.log(`  clients (credit_balance/credit_limit/is_frozen only): ${snapshot.clients.length} rows`);

  fs.writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2));
  console.log(`\nSnapshot written to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Snapshot failed:", err.message ?? err);
  process.exit(1);
});
