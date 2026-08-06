import type { SupabaseClient } from "@supabase/supabase-js";
import { generateTokenString, computeTokenExpiry } from "@/lib/stakeholders/tokens";
import { sendEmail } from "@/lib/email/sender";
import { notify } from "@/lib/notifications/notify";
import { renderStakeholderBufferUpdateEmail } from "@/lib/email/templates/StakeholderBufferUpdateEmail";
import { renderModificationsRequestedEmail } from "@/lib/email/templates/ModificationsRequestedEmail";

export interface BufferUpdateResult {
  total: number;
  responded: number;
  freshTokensIssued: number;
}

/**
 * Emails every stakeholder on a review cycle a status update (X of Y
 * responded), issuing a fresh token to anyone still pending so their link
 * keeps working. Shared by the daily "approval-buffer" worker job (1 working
 * day after the first response) and the admin/consultant manual resend
 * action — both need the exact same send, just triggered differently.
 */
export async function sendStakeholderBufferUpdate(
  supabase: SupabaseClient,
  projectId: string,
  reviewCycle: number,
  stateTerritory: string | null,
  logPrefix: string
): Promise<BufferUpdateResult | null> {
  const { data: reviews } = await supabase
    .from("stakeholder_reviews")
    .select("id, stakeholder_email, stakeholder_name, status")
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle);

  if (!reviews || reviews.length === 0) return null;

  const total = reviews.length;
  const responded = reviews.filter((r) => (r.status as string) !== "pending").length;

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

    const approvalUrl = fresh ? `${process.env.NEXT_PUBLIC_APP_URL}/approve/${fresh.token}` : null;
    const expiresFormatted = fresh
      ? fresh.expiresAt.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })
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
      source: "stakeholder_buffer_update",
      projectId,
    }).catch((err) => {
      console.error(`${logPrefix} email to ${email} failed:`, err);
    });
  }

  // Notify admins of any still-non-responding stakeholders, using the same
  // "review cycle needs attention" email as a rejection would (see
  // notifyModificationsRequested) rather than a separate one-off template —
  // fresh links have already been issued to them above.
  const nonResponding = reviews.filter((r) => (r.status as string) === "pending");
  if (nonResponding.length > 0) {
    const { data: admins } = await supabase.from("users").select("id, first_name").in("role", ["super_admin", "admin"]);
    const names = nonResponding.map((r) => r.stakeholder_name as string);
    const projectRef = projectId.slice(0, 8);
    const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ops/projects/${projectId}`;
    await Promise.all(
      (admins ?? []).map((a) => {
        const firstName = (a.first_name as string | null) ?? "there";
        const emailHtml = renderModificationsRequestedEmail({
          consultantName: firstName,
          projectId: projectRef,
          modifications: [],
          awaitingResponse: names,
          projectUrl,
        });
        return notify({
          recipientId: a.id as string,
          type: "project_dispatched",
          message: `${nonResponding.length} stakeholder(s) awaiting response for ${projectRef}.`,
          projectId,
          emailSubject: `Awaiting stakeholder response — ${projectRef}`,
          emailHtml,
        }).catch(() => {});
      })
    );
  }

  console.log(`${logPrefix} project ${projectId}: ${responded}/${total} responded, ${freshTokensMap.size} fresh token(s) issued`);

  return { total, responded, freshTokensIssued: freshTokensMap.size };
}
