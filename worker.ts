import { PgBoss } from "pg-boss";
import { createAdminClient } from "@/lib/supabase/admin";
import { generatePbdb } from "@/lib/documents/generator";
import { dispatchPbdb } from "@/lib/stakeholders/dispatch";
import { generateTokenString, computeTokenExpiry } from "@/lib/stakeholders/tokens";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";
import { addWorkingDays } from "@/lib/delivery/working-days";
import { sendEmail } from "@/lib/email/sender";
import { notify } from "@/lib/notifications/notify";
import { renderStakeholderBufferUpdateEmail } from "@/lib/email/templates/StakeholderBufferUpdateEmail";
import { deliverPbdr } from "@/lib/documents/delivery";
import { sendAvailableRequestsDigest } from "@/lib/jobs/available-requests-digest";
import {
  reconcileDigestSchedule,
  AVAILABLE_REQUESTS_DIGEST_QUEUE,
} from "@/lib/jobs/digest-schedule-reconciler";

async function main() {
  const boss = new PgBoss(process.env.DATABASE_URL!);

  boss.on("error", (error: Error) => console.error("[worker] pg-boss error:", error));

  await boss.start();

  console.log("[worker] OPS worker started — awaiting jobs");

  // pg-boss v12 requires queues to exist (via createQueue) before they can be
  // scheduled or sent to — schedule()/send() insert rows with a FK to queue.name.
  for (const queue of [
    "purge-recovery-bin",
    "expire-draft",
    "generate-pbdb",
    "dispatch-pbdb",
    "approval-buffer",
    "deliver-pbdr",
    AVAILABLE_REQUESTS_DIGEST_QUEUE,
    "reconcile-digest-schedule",
  ]) {
    await boss.createQueue(queue);
  }

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
          throw err;
        }
      }
    }
  );

  // Dispatch PBDB to stakeholders. Job data: { projectId: string, actorId: string }
  await boss.work<{ projectId: string; actorId: string }>(
    "dispatch-pbdb",
    async (jobs) => {
      for (const job of jobs) {
        const { projectId, actorId } = job.data;
        try {
          await dispatchPbdb(projectId, actorId);
          console.log(`[dispatch-pbdb] dispatched project ${projectId}`);
        } catch (err) {
          console.error(`[dispatch-pbdb] failed for project ${projectId}:`, err);
          throw err;
        }
      }
    }
  );

  // Approval buffer: daily at 09:00.
  // After 1 working day from first_response_at, send update emails.
  // Fresh tokens issued to non-responding stakeholders.
  await boss.schedule("approval-buffer", "0 9 * * 1-5", {});
  await boss.work("approval-buffer", async () => {
    const supabase = createAdminClient();

    // Find dispatched projects with a first_response_at but buffer not yet fired
    const { data: projects, error } = await supabase
      .from("projects")
      .select(
        "id, review_cycle, first_response_at, organisations(state_territory)"
      )
      .eq("status", "dispatched")
      .not("first_response_at", "is", null)
      .is("review_buffer_fired_at", null);

    if (error) {
      console.error("[approval-buffer] query failed:", error);
      return;
    }

    for (const project of projects ?? []) {
      const projectId = project.id as string;
      const reviewCycle = project.review_cycle as number;
      const firstResponseAt = new Date(project.first_response_at as string);
      const stateTerritory =
        (project.organisations as unknown as { state_territory: string | null } | null)
          ?.state_territory ?? null;

      // Check if 1 working day has elapsed since first response
      const year = firstResponseAt.getUTCFullYear();
      const holidays = await getPublicHolidays(stateTerritory, year);
      const bufferDeadline = addWorkingDays(firstResponseAt, 1, holidays);
      if (new Date() < bufferDeadline) continue;

      // Mark buffer as fired
      await supabase
        .from("projects")
        .update({ review_buffer_fired_at: new Date().toISOString() })
        .eq("id", projectId);

      // Load all reviews for this cycle
      const { data: reviews } = await supabase
        .from("stakeholder_reviews")
        .select("id, stakeholder_email, stakeholder_name, status")
        .eq("project_id", projectId)
        .eq("review_cycle", reviewCycle);

      if (!reviews || reviews.length === 0) continue;

      const total = reviews.length;
      const responded = reviews.filter(
        (r) => (r.status as string) !== "pending"
      ).length;

      // Issue fresh tokens to non-responding stakeholders (update row in-place)
      const freshTokensMap = new Map<string, { token: string; expiresAt: Date }>();
      for (const review of reviews) {
        if ((review.status as string) !== "pending") continue;
        const token = generateTokenString();
        const expiresAt = await computeTokenExpiry(new Date(), stateTerritory);
        await supabase
          .from("stakeholder_reviews")
          .update({
            token,
            expires_at: expiresAt.toISOString(),
            fresh_token_sent_at: new Date().toISOString(),
          })
          .eq("id", review.id as string);
        freshTokensMap.set(review.stakeholder_email as string, { token, expiresAt });
      }

      // Email all stakeholders
      for (const review of reviews) {
        const email = review.stakeholder_email as string;
        const name = review.stakeholder_name as string;
        const isPending = (review.status as string) === "pending";
        const fresh = freshTokensMap.get(email);

        const approvalUrl = fresh
          ? `${process.env.NEXT_PUBLIC_APP_URL}/approve/${fresh.token}`
          : null;
        const expiresFormatted = fresh
          ? fresh.expiresAt.toLocaleDateString("en-AU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })
          : null;

        const html = renderStakeholderBufferUpdateEmail({
          stakeholderName: name,
          projectId: projectId.slice(0, 8),
          totalStakeholders: total,
          respondedCount: responded,
          approvalUrl: isPending ? approvalUrl : null,
          expiresAt: isPending ? expiresFormatted : null,
        });

        await sendEmail({
          to: email,
          subject: `Approval status update (ref: ${projectId.slice(0, 8)})`,
          html,
        }).catch((err) => {
          console.error(`[approval-buffer] email to ${email} failed:`, err);
        });
      }

      // Notify super admins of any still-non-responding stakeholders
      const nonResponding = reviews.filter((r) => (r.status as string) === "pending");
      if (nonResponding.length > 0) {
        const { data: admins } = await supabase
          .from("users")
          .select("id")
          .in("role", ["super_admin", "admin"]);
        const adminIds = (admins ?? []).map((u: { id: string }) => u.id);
        const names = nonResponding.map((r) => r.stakeholder_name as string).join(", ");
        const html = `<p style="font-family:sans-serif">${nonResponding.length} stakeholder(s) have not responded to the approval request for project <strong>${projectId.slice(0, 8)}</strong>: ${names}. Fresh links have been sent. If they do not respond, use the admin dashboard to waive their response.</p>`;
        await Promise.all(
          adminIds.map((id) =>
            notify({
              recipientId: id,
              type: "project_dispatched",
              message: `${nonResponding.length} stakeholder(s) awaiting response for ${projectId.slice(0, 8)}.`,
              projectId,
              emailSubject: `Awaiting stakeholder response — ${projectId.slice(0, 8)}`,
              emailHtml: html,
            }).catch(() => {})
          )
        );
      }

      console.log(
        `[approval-buffer] project ${projectId}: ${responded}/${total} responded, ${freshTokensMap.size} fresh token(s) issued`
      );
    }
  });

  // Deliver PBDR for a project. Job data: { projectId: string, actorId: string, actorEmail: string }
  await boss.work<{ projectId: string; actorId: string | null; actorEmail: string | null }>(
    "deliver-pbdr",
    async (jobs) => {
      for (const job of jobs) {
        const { projectId, actorId, actorEmail } = job.data;
        const result = await deliverPbdr(projectId, actorId, actorEmail);
        if (!result.success) {
          console.error(`[deliver-pbdr] failed for ${projectId}: ${result.reason}`);
          throw new Error(result.reason);
        }
      }
    }
  );

  // Twice-daily digest of available (submitted, unassigned) projects, sent to
  // consultants/admins/super_admins. Send times are admin-configurable — see
  // reconcile-digest-schedule below, which keeps this in sync without a restart.
  await boss.work(AVAILABLE_REQUESTS_DIGEST_QUEUE, async () => {
    const supabase = createAdminClient();
    const result = await sendAvailableRequestsDigest(supabase);
    console.log(
      `[available-requests-digest] count=${result.count} sent=${result.sent} recipients=${result.recipients}`
    );
  });

  // Keep the digest schedule in sync with admin-configured settings. Applied
  // once at startup, then every minute — pg-boss schedule() upserts on
  // (name, key), so this is a safe no-op when nothing has changed.
  const settingsClient = createAdminClient();
  await reconcileDigestSchedule(boss, settingsClient);
  await boss.schedule("reconcile-digest-schedule", "*/1 * * * *", {});
  await boss.work("reconcile-digest-schedule", async () => {
    await reconcileDigestSchedule(boss, createAdminClient());
  });
}

main().catch((error) => {
  console.error("[worker] fatal startup error:", error);
  process.exit(1);
});
