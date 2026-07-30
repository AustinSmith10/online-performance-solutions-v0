// Restores the database to whatever snapshot.mjs last captured — run this
// between UAT rounds (or after a tester session) instead of re-seeding by
// hand. Deletes the current contents of the tracked tables and reinserts
// exactly what was in the snapshot, then restores each client's
// credit_balance / credit_limit / is_frozen.
//
// Deliberately leaves audit_log and credit_ledger alone — see snapshot.mjs
// for why — so this round's activity stays visible in both, it just isn't
// rewound.
//
// Usage:
//   node --env-file=.env.local scripts/uat/reset.mjs [path]
//   (defaults to scripts/uat/snapshot.json)
//
// Refuses to run if no snapshot file exists yet, rather than silently
// wiping tables with nothing to restore.

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { TABLES } from "./snapshot.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IN_PATH = process.argv[2] || path.join(__dirname, "snapshot.json");

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function deleteAll(table) {
  // PostgREST requires a filter on delete; id is a uuid PK on every table
  // here except resolved_signals (text PK signal_id) — match whichever exists.
  const pk = table === "resolved_signals" ? "signal_id" : "id";
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .not(pk, "is", null);
  if (error) throw new Error(`[reset] delete ${table}: ${error.message}`);
  return count ?? 0;
}

async function insertAll(table, rows) {
  if (rows.length === 0) return 0;
  // Chunk to stay well under PostgREST's payload/row limits on larger tables.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK));
    if (error) throw new Error(`[reset] insert ${table}: ${error.message}`);
  }
  return rows.length;
}

async function main() {
  if (!fs.existsSync(IN_PATH)) {
    console.error(`No snapshot found at ${IN_PATH} — run snapshot.mjs first.`);
    process.exit(1);
  }
  const snapshot = JSON.parse(fs.readFileSync(IN_PATH, "utf8"));
  console.log(`Restoring snapshot taken at ${snapshot.takenAt}\n`);

  console.log("Deleting current rows (children first)...");
  for (const table of [...TABLES].reverse()) {
    const n = await deleteAll(table);
    console.log(`  ${table}: ${n} deleted`);
  }

  console.log("\nReinserting snapshot (parents first)...");
  for (const table of TABLES) {
    const rows = snapshot.tables[table] ?? [];
    const n = await insertAll(table, rows);
    console.log(`  ${table}: ${n} inserted`);
  }

  console.log("\nRestoring client credit balances...");
  for (const client of snapshot.clients ?? []) {
    const { error } = await supabase
      .from("clients")
      .update({
        credit_balance: client.credit_balance,
        credit_limit: client.credit_limit,
        is_frozen: client.is_frozen,
      })
      .eq("id", client.id);
    if (error) throw new Error(`[reset] clients ${client.id}: ${error.message}`);
    console.log(`  ${client.id}: credit_balance=${client.credit_balance}`);
  }

  console.log("\nReset complete. audit_log and credit_ledger were left untouched.");
}

main().catch((err) => {
  console.error("Reset failed:", err.message ?? err);
  process.exit(1);
});
