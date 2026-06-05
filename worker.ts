import { PgBoss } from "pg-boss";

async function main() {
  const boss = new PgBoss(process.env.DATABASE_URL!);

  boss.on("error", (error: Error) => console.error("[worker] pg-boss error:", error));

  await boss.start();

  console.log("[worker] OPS worker started — awaiting jobs");

  // Job handlers are registered here as features are built:
  // e.g. boss.work("generate-pbdb", handlers.generatePbdb)
  //      boss.work("dispatch-email", handlers.dispatchEmail)
}

main().catch((error) => {
  console.error("[worker] fatal startup error:", error);
  process.exit(1);
});
