import { PgBoss } from "pg-boss";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePbdb } from "@/lib/documents/generator";

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

  // Expire abandoned email-sourced drafts. Runs daily at 02:00.
  // Per-org cutoff derived from organisations.abandoned_draft_days (default 14).
  await boss.schedule("expire-draft", "0 2 * * *", {});
  await boss.work("expire-draft", async () => {
    const supabase = createAdminClient();

    const { data: orgs, error: orgError } = await supabase
      .from("organisations")
      .select("id, abandoned_draft_days");

    if (orgError || !orgs) {
      console.error("[expire-draft] Failed to fetch organisations:", orgError);
      return;
    }

    let totalExpired = 0;

    for (const org of orgs) {
      const days = (org.abandoned_draft_days as number) ?? 14;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      const { error, count } = await supabase
        .from("projects")
        .update({ deleted_at: new Date().toISOString() }, { count: "exact" })
        .eq("org_id", org.id)
        .eq("status", "draft")
        .is("deleted_at", null)
        .lt("updated_at", cutoff);

      if (error) {
        console.error(`[expire-draft] Failed for org ${org.id}:`, error);
      } else {
        totalExpired += count ?? 0;
      }
    }

    console.log(`[expire-draft] Expired ${totalExpired} abandoned draft(s)`);
  });

  // Generate PBDB for a project. Job data: { projectId: string, actorId: string }
  await boss.work<{ projectId: string; actorId: string }>(
    "generate-pbdb",
    async (jobs) => {
      for (const job of jobs) {
        const { projectId, actorId } = job.data;
        try {
          await generatePbdb(projectId, actorId);
          console.log(`[generate-pbdb] generated PBDB for project ${projectId}`);
        } catch (err) {
          console.error(`[generate-pbdb] failed for project ${projectId}:`, err);
          throw err; // re-throw so pg-boss marks the job as failed
        }
      }
    }
  );
}

main().catch((error) => {
  console.error("[worker] fatal startup error:", error);
  process.exit(1);
});
