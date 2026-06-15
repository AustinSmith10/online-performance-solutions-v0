import { PgBoss } from "pg-boss";
import { createAdminClient } from "@/lib/supabase/admin";

async function main() {
  const boss = new PgBoss(process.env.DATABASE_URL!);

  boss.on("error", (error: Error) => console.error("[worker] pg-boss error:", error));

  await boss.start();

  console.log("[worker] OPS worker started — awaiting jobs");

  // Purge soft-deleted projects older than 30 days. Runs daily at midnight.
  await boss.schedule("purge-recovery-bin", "0 0 * * *", {});
  await boss.work("purge-recovery-bin", async () => {
    const supabase = createAdminClient();
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await supabase
      .from("projects")
      .delete({ count: "exact" })
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoff);
    if (error) {
      console.error("[purge-recovery-bin] failed:", error);
    } else {
      console.log(`[purge-recovery-bin] permanently removed ${count ?? 0} project(s)`);
    }
  });

  // Job handlers are registered here as features are built:
  // e.g. boss.work("generate-pbdb", handlers.generatePbdb)
  //      boss.work("dispatch-email", handlers.dispatchEmail)
}

main().catch((error) => {
  console.error("[worker] fatal startup error:", error);
  process.exit(1);
});
