"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { validateToken, generateTokenString, computeTokenExpiry } from "@/lib/stakeholders/tokens";
import { auditLog } from "@/lib/audit/log";
import { renderApprovalRequestEmail } from "@/lib/email/templates/ApprovalRequestEmail";
import { sendEmail } from "@/lib/email/sender";
import {
  resolveProjectRef,
  notifyModificationsRequested,
  notifyIfFullyApproved,
} from "@/lib/stakeholders/review-outcome";
import { recordRevisionEvent } from "@/lib/documents/revision-history";

export interface ApprovalState {
  error?: string;
  expired?: boolean;
  submitted?: boolean;
  response?: "approved" | "rejected";
}

export async function submitApproval(
  tokenString: string,
  _reviewId: string | null,
  _prevState: ApprovalState,
  formData: FormData
): Promise<ApprovalState> {
  const response = formData.get("response") as string | null;
  const comments = (formData.get("comments") as string | null)?.trim() || null;

  if (response !== "approved" && response !== "rejected") {
    return { error: "Please select a response." };
  }
  if (response === "rejected" && !comments) {
    return { error: "Please describe what needs to be changed before rejecting." };
  }

  const validated = await validateToken(tokenString);
  if (!validated) return { error: "Invalid approval link." };
  if (validated.isExpired)
    return { error: "This approval link has expired.", expired: true };

  const { review } = validated;
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  if (review.status !== "pending") {
    return { error: "This approval link is no longer valid — a response has already been recorded." };
  }

  const { data: projectForGuard } = await supabase
    .from("projects")
    .select("status, review_cycle")
    .eq("id", review.project_id)
    .single();

  if (!projectForGuard) return { error: "This approval link is no longer valid." };
  if ((projectForGuard.review_cycle as number) !== review.review_cycle) {
    return { error: "This approval link is no longer valid — the project has moved to a new review cycle." };
  }
  // "revision_required" is allowed alongside "dispatched" — that status only
  // means *some other* stakeholder in this same cycle already rejected, not
  // that this stakeholder's own still-pending review is closed. The
  // review_cycle check above (plus the per-row pending/conditional-update
  // guard below) is what actually prevents stale or duplicate submissions;
  // this just blocks genuinely closed states (converting/delivered/etc.).
  const openStatuses = new Set(["dispatched", "revision_required"]);
  if (!openStatuses.has(projectForGuard.status as string)) {
    return { error: "This approval link is no longer valid — the project is no longer awaiting review." };
  }

  // Derive the four-state status from response + whether comments were provided
  const newStatus =
    response === "approved"
      ? comments ? "approved_with_comments" : "approved_without_comments"
      : "rejected_with_comments";

  const { error: updateErr, count } = await supabase
    .from("stakeholder_reviews")
    .update({ status: newStatus, comments, responded_at: now }, { count: "exact" })
    .eq("id", review.id)
    .eq("status", "pending");

  if (updateErr) return { error: "Failed to record your response. Please try again." };
  if (count === 0) {
    return { error: "This approval link is no longer valid — a response has already been recorded." };
  }

  await supabase
    .from("projects")
    .update({ first_response_at: now, updated_at: now })
    .eq("id", review.project_id)
    .is("first_response_at", null);

  await auditLog("stakeholder.responded", null, review.stakeholder_email, {
    projectId: review.project_id,
    metadata: {
      response: newStatus,
      review_cycle: review.review_cycle,
      stakeholder_email: review.stakeholder_email,
    },
  });

  const { data: project } = await supabase
    .from("projects")
    .select("submitted_by, review_cycle, extracted_fields, project_number, assigned_consultant_id, qa_completed_by")
    .eq("id", review.project_id)
    .single();

  if (!project) return { submitted: true, response };

  const projectRef = resolveProjectRef(project, review.project_id);
  const cycle = project.review_cycle as number;

  if (response === "rejected") {
    await supabase
      .from("projects")
      .update({ status: "revision_required", updated_at: now })
      .eq("id", review.project_id);

    // Bumps the PBDB revision_history counter (#108) — the corrected reupload
    // later derives its Rev{n} filename from this row, not review_cycle.
    await recordRevisionEvent(supabase, review.project_id, "pbdb", "rejected");

    await notifyModificationsRequested({
      supabase,
      projectId: review.project_id,
      reviewCycle: cycle,
      projectRef,
      stakeholderName: review.stakeholder_name as string,
      comments,
      qaCompletedBy: project.qa_completed_by as string | null,
      assignedConsultantId: project.assigned_consultant_id as string | null,
      messageVerb: "rejected",
      subjectLabel: "Rejection received",
    });
  } else {
    await notifyIfFullyApproved(supabase, review.project_id, cycle, "[submitApproval]");
  }

  return { submitted: true, response };
}

// ─── Self-serve token reissue (expired link) ──────────────────────────────────

export interface RequestNewLinkState {
  error?: string;
  sent?: boolean;
}

export async function requestNewApprovalLink(
  tokenString: string,
  _prevState: RequestNewLinkState,
  _formData: FormData
): Promise<RequestNewLinkState> {
  const validated = await validateToken(tokenString);
  if (!validated) return { error: "This link is no longer valid." };

  const { review, isExpired } = validated;
  if (!isExpired || review.status !== "pending") {
    return { error: "This link is no longer eligible for a new one." };
  }

  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("review_cycle, clients(state_territory)")
    .eq("id", review.project_id)
    .single();

  if (!project) return { error: "This link is no longer valid." };

  // The expired token's review row may belong to a stale cycle if the project
  // has since moved on — always reissue against the *current* cycle's row.
  const currentCycle = project.review_cycle as number;
  const { data: currentReview } = await supabase
    .from("stakeholder_reviews")
    .select("id, token, status, stakeholder_name, stakeholder_email")
    .eq("project_id", review.project_id)
    .eq("review_cycle", currentCycle)
    .eq("stakeholder_email", review.stakeholder_email)
    .maybeSingle();

  if (!currentReview || (currentReview.status as string) !== "pending") {
    return { error: "This link is no longer eligible for a new one." };
  }

  const stateTerritory =
    (project.clients as unknown as { state_territory: string | null } | null)?.state_territory ??
    null;

  const token = generateTokenString();
  const expiresAt = await computeTokenExpiry(new Date(), stateTerritory);
  const expiresFormatted = expiresAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const { count } = await supabase
    .from("stakeholder_reviews")
    .update(
      { token, expires_at: expiresAt.toISOString(), fresh_token_sent_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", currentReview.id)
    .eq("token", currentReview.token as string);

  if (!count) return { error: "This link is no longer eligible for a new one." };

  const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/approve/${token}`;
  const emailHtml = renderApprovalRequestEmail({
    stakeholderName: currentReview.stakeholder_name as string,
    projectId: review.project_id.slice(0, 8),
    approvalUrl,
    expiresAt: expiresFormatted,
    isFreshToken: true,
  });

  await sendEmail({
    to: currentReview.stakeholder_email as string,
    subject: `Reminder: approval required (ref: ${review.project_id.slice(0, 8)})`,
    html: emailHtml,
    source: "approval_self_reissue",
    projectId: review.project_id,
  }).catch((err) => {
    console.error(`[requestNewApprovalLink] email to ${currentReview.stakeholder_email} failed:`, err);
  });

  await auditLog("stakeholder.token_self_reissued", null, currentReview.stakeholder_email as string, {
    projectId: review.project_id,
    metadata: { review_id: currentReview.id, email: currentReview.stakeholder_email, review_cycle: currentCycle },
  });

  return { sent: true };
}
