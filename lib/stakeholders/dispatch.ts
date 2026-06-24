import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStakeholders } from "./resolver";
import { generateTokenString, computeTokenExpiry } from "./tokens";
import { checkDispatchGate } from "@/lib/payments/gate";
import { deductCredit, debitDeferred, logUpfront } from "@/lib/payments/ledger";
import { notify } from "@/lib/notifications/notify";
import { auditLog } from "@/lib/audit/log";
import { sendEmail } from "@/lib/email/sender";
import { renderApprovalRequestEmail } from "@/lib/email/templates/ApprovalRequestEmail";
import { renderRevisionNoticeEmail } from "@/lib/email/templates/RevisionNoticeEmail";

function e(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function dispatchPbdb(projectId: string, actorId: string): Promise<void> {
  const supabase = createAdminClient();

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select(
      "id, org_id, template_id, submitted_by, status, review_cycle, credit_deducted, project_number, extracted_fields, organisations(state_territory, payment_method, name)"
    )
    .eq("id", projectId)
    .single();

  if (projErr || !project) throw new Error("Project not found.");

  const org = project.organisations as unknown as {
    state_territory: string | null;
    payment_method: string;
    name: string;
  } | null;

  const orgId = project.org_id as string;
  const stateTerritory = org?.state_territory ?? null;
  const paymentMethod = org?.payment_method ?? "upfront";
  const reviewCycle = (project.review_cycle as number) ?? 1;

  // Payment gate + deduction (first cycle only, skip if already deducted)
  if (!(project.credit_deducted as boolean)) {
    const gate = await checkDispatchGate(orgId, projectId);
    if (!gate.allowed) {
      const { data: admins } = await supabase.from("users").select("id").eq("role", "super_admin");
      const html = `<p style="font-family:sans-serif">Dispatch blocked for project <strong>${e(projectId.slice(0, 8))}</strong>: ${e(gate.reason ?? "Unknown reason")}</p>`;
      await Promise.all(
        (admins ?? []).map((u: { id: string }) =>
          notify({
            recipientId: u.id,
            type: "insufficient_credit",
            message: `Dispatch blocked: ${gate.reason}`,
            projectId,
            emailSubject: "Dispatch blocked — payment gate failed",
            emailHtml: html,
          }).catch(() => {})
        )
      );
      throw new Error(`Dispatch blocked: ${gate.reason}`);
    }

    if (paymentMethod === "credit_deduction") {
      await deductCredit(orgId, projectId, actorId);
    } else if (paymentMethod === "deferred") {
      await debitDeferred(orgId, projectId, actorId);
    } else {
      await logUpfront(orgId, projectId, actorId);
    }
  }

  // Resolve stakeholders, then always prepend the submitting client
  const resolved = await resolveStakeholders(projectId, orgId);

  const { data: submitter } = await supabase
    .from("users")
    .select("email, first_name, last_name")
    .eq("id", project.submitted_by as string)
    .maybeSingle();

  const stakeholders = [...resolved];
  if (submitter) {
    const submitterEmail = (submitter.email as string).toLowerCase();
    if (!stakeholders.some((s) => s.email.toLowerCase() === submitterEmail)) {
      const firstName = (submitter.first_name as string | null) ?? "";
      const lastName = (submitter.last_name as string | null) ?? "";
      const name = [firstName, lastName].filter(Boolean).join(" ") || submitterEmail;
      stakeholders.unshift({ id: `client-${project.submitted_by as string}`, name, email: submitterEmail, company: null });
    }
  }

  if (stakeholders.length === 0) throw new Error("No stakeholders configured for this project.");

  const fields = project.extracted_fields as Record<string, string> | null;
  const projectRef =
    fields?.["EXTRACT_ADDRESS"] ??
    (project.project_number as string | null) ??
    projectId.slice(0, 8);

  const now = new Date();
  const expiresAt = await computeTokenExpiry(now, stateTerritory);
  const expiresFormatted = expiresAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Fetch signed PBDB URL and portal user map in parallel
  const stakeholderEmails = stakeholders.map((s) => s.email.toLowerCase());
  const [pbdbFileResult, portalUsersResult] = await Promise.all([
    supabase
      .from("project_files")
      .select("storage_path, original_filename")
      .eq("project_id", projectId)
      .eq("file_type", "pbdb")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("users")
      .select("id, email, role")
      .in("email", stakeholderEmails),
  ]);

  const pbdbFile = pbdbFileResult.data;
  const pbdbUrl = pbdbFile
    ? await supabase.storage
        .from("documents")
        .createSignedUrl(pbdbFile.storage_path as string, 7 * 24 * 3600)
        .then((r) => r.data?.signedUrl ?? null)
    : null;

  // Map email → portal user so we can use notify() for users with accounts
  const portalUserMap = new Map(
    (portalUsersResult.data ?? []).map((u) => [
      (u.email as string).toLowerCase(),
      u as { id: string; email: string; role: string },
    ])
  );

  // On revision cycles, notify stakeholders who previously approved that the document changed
  if (reviewCycle > 1) {
    const { data: priorAcknowledged } = await supabase
      .from("stakeholder_reviews")
      .select("stakeholder_email, stakeholder_name")
      .eq("project_id", projectId)
      .eq("review_cycle", reviewCycle - 1)
      .in("status", ["approved_without_comments", "approved_with_comments"]);

    for (const prior of priorAcknowledged ?? []) {
      const noticeHtml = renderRevisionNoticeEmail({
        stakeholderName: prior.stakeholder_name as string,
        projectId: projectId.slice(0, 8),
      });
      await sendEmail({
        to: prior.stakeholder_email as string,
        subject: `Document revised — re-approval required (ref: ${projectId.slice(0, 8)})`,
        html: noticeHtml,
      }).catch((err) => {
        console.error(`[dispatch-pbdb] revision notice to ${prior.stakeholder_email} failed:`, err);
      });
    }
  }

  // Create one stakeholder_reviews row per stakeholder (token embedded)
  for (const stakeholder of stakeholders) {
    const token = generateTokenString();
    const portalUser = portalUserMap.get(stakeholder.email.toLowerCase());

    // Clients with portal accounts go to the inline approval form; everyone else uses the token URL
    const approvalUrl =
      portalUser?.role === "client"
        ? `${process.env.NEXT_PUBLIC_APP_URL}/portal/projects/${projectId}`
        : `${process.env.NEXT_PUBLIC_APP_URL}/approve/${token}`;

    await supabase.from("stakeholder_reviews").upsert(
      {
        project_id: projectId,
        review_cycle: reviewCycle,
        stakeholder_email: stakeholder.email,
        stakeholder_name: stakeholder.name,
        token,
        dispatched_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        fresh_token_sent_at: null,
        status: "pending",
        comments: null,
        responded_at: null,
      },
      { onConflict: "project_id,review_cycle,stakeholder_email" }
    );

    const emailHtml = renderApprovalRequestEmail({
      stakeholderName: stakeholder.name,
      projectId: projectId.slice(0, 8),
      approvalUrl,
      expiresAt: expiresFormatted,
      pbdbUrl,
    });

    if (portalUser) {
      // Portal user — in-app notification + email via notify()
      await notify({
        recipientId: portalUser.id,
        type: "approval_request",
        message: `Your PBDB review is ready for ${projectRef} — please submit your response.`,
        projectId,
        emailSubject: `Approval required — PBDB review (ref: ${projectId.slice(0, 8)})`,
        emailHtml,
      }).catch(() => {});
    } else {
      // External stakeholder — email only
      await sendEmail({
        to: stakeholder.email,
        subject: `Approval required — PBDB review (ref: ${projectId.slice(0, 8)})`,
        html: emailHtml,
      }).catch((err) => {
        console.error(`[dispatch-pbdb] email to ${stakeholder.email} failed:`, err);
      });
    }
  }

  // Transition project to dispatched
  await supabase
    .from("projects")
    .update({ status: "dispatched", updated_at: now.toISOString() })
    .eq("id", projectId);

  await auditLog("project.dispatched", actorId, null, {
    projectId,
    orgId,
    metadata: { review_cycle: reviewCycle, stakeholder_count: stakeholders.length },
  });

  console.log(
    `[dispatch-pbdb] project ${projectId} cycle ${reviewCycle} → ${stakeholders.length} stakeholder(s)`
  );
}
