import { createAdminClient } from "@/lib/supabase/admin";
import { generateTokenString, computeTokenExpiry } from "./tokens";
import { sendEmail } from "@/lib/email/sender";
import { buildStakeholderReplyTo } from "@/lib/email/parser";
import { renderApprovalRequestEmail } from "@/lib/email/templates/ApprovalRequestEmail";
import { notify } from "@/lib/notifications/notify";
import { getOrCreateDispatchPdf } from "@/lib/documents/pbdb-pdf";

// A reviewer added to a project *after* the current review cycle has already
// been dispatched is a "late add": they must be invited immediately (own
// stakeholder_reviews row + email/token, same as everyone else in that
// cycle) so the PBDR-conversion gate — which only checks for pending rows —
// actually waits on them too. If the cycle hasn't been dispatched yet, this
// is a no-op: the normal dispatch flow will pick up the new project-scope
// stakeholder when it runs.
export async function inviteLateStakeholder(
  projectId: string,
  stakeholder: { name: string; email: string },
  actorId: string
): Promise<void> {
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, review_cycle, status, strip_token_color, clients(state_territory)")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) return;
  const status = project.status as string;
  if (status !== "dispatched" && status !== "revision_required") return;

  const reviewCycle = (project.review_cycle as number) ?? 1;

  const { count } = await supabase
    .from("stakeholder_reviews")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle);

  if (!count) return;

  const email = stakeholder.email.toLowerCase();
  const stateTerritory =
    (project.clients as unknown as { state_territory: string | null } | null)?.state_territory ?? null;

  const token = generateTokenString();
  const expiresAt = await computeTokenExpiry(new Date(), stateTerritory);
  const expiresFormatted = expiresAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const { data: portalUser } = await supabase
    .from("users")
    .select("id, email, role")
    .ilike("email", email)
    .maybeSingle();

  const approvalUrl =
    (portalUser?.role as string | undefined) === "stakeholder"
      ? `${process.env.NEXT_PUBLIC_APP_URL}/portal/projects/${projectId}`
      : `${process.env.NEXT_PUBLIC_APP_URL}/approve/${token}`;

  await supabase.from("stakeholder_reviews").upsert(
    {
      project_id: projectId,
      review_cycle: reviewCycle,
      stakeholder_email: email,
      stakeholder_name: stakeholder.name,
      token,
      dispatched_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
      fresh_token_sent_at: null,
      status: "pending",
      comments: null,
      responded_at: null,
    },
    { onConflict: "project_id,review_cycle,stakeholder_email" }
  );

  const pbdbPdf = await getOrCreateDispatchPdf(
    supabase,
    {
      id: projectId,
      client_id: project.client_id as string,
      review_cycle: reviewCycle,
      strip_token_color: project.strip_token_color as boolean | null,
    },
    actorId
  );
  const pbdbUrl = pbdbPdf
    ? await supabase.storage
        .from("documents")
        .createSignedUrl(pbdbPdf.storagePath, 7 * 24 * 3600)
        .then((r) => r.data?.signedUrl ?? null)
    : null;

  const emailHtml = renderApprovalRequestEmail({
    stakeholderName: stakeholder.name,
    projectId: projectId.slice(0, 8),
    approvalUrl,
    expiresAt: expiresFormatted,
    pbdbUrl,
  });

  const replyTo = buildStakeholderReplyTo(token);

  if (portalUser) {
    await notify({
      recipientId: portalUser.id as string,
      type: "approval_request",
      message: `You've been added as a reviewer — your PBDB review is ready for you to submit a response.`,
      projectId,
      emailSubject: `Approval required — PBDB review (ref: ${projectId.slice(0, 8)})`,
      emailHtml,
      ...(replyTo ? { replyTo } : {}),
    }).catch(() => {});
  } else {
    await sendEmail({
      to: stakeholder.email,
      subject: `Approval required — PBDB review (ref: ${projectId.slice(0, 8)})`,
      html: emailHtml,
      source: "stakeholder_late_add",
      projectId,
      ...(replyTo ? { replyTo } : {}),
    }).catch((err) => {
      console.error(`[late-add-stakeholder] email to ${stakeholder.email} failed:`, err);
    });
  }
}
