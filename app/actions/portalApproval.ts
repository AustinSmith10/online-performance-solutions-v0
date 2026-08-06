"use server";

import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { recordRevisionEvent } from "@/lib/documents/revision-history";
import { renderReviewResponseConfirmationEmail } from "@/lib/email/templates/ReviewResponseConfirmationEmail";
import {
  resolveProjectRef,
  notifyModificationsRequested,
  notifyIfFullyApproved,
} from "@/lib/stakeholders/review-outcome";

export interface PortalApprovalState {
  error?: string;
  submitted?: boolean;
  response?: "approved" | "rejected";
}

export async function submitPortalApproval(
  reviewId: string,
  _prev: PortalApprovalState,
  formData: FormData
): Promise<PortalApprovalState> {
  const user = await requireRole("stakeholder");

  const response = formData.get("response") as string | null;
  const comments = (formData.get("comments") as string | null)?.trim() || null;

  if (response !== "approved" && response !== "rejected") {
    return { error: "Please select a response." };
  }
  if (response === "rejected" && !comments) {
    return { error: "Please describe what needs to be changed." };
  }

  const supabase = createAdminClient();

  const { data: review } = await supabase
    .from("stakeholder_reviews")
    .select("id, project_id, stakeholder_email, stakeholder_name, status, review_cycle")
    .eq("id", reviewId)
    .eq("stakeholder_email", user.email as string)
    .maybeSingle();

  if (!review) return { error: "Review not found." };
  if (review.status !== "pending") {
    return { error: "You have already submitted a response for this review." };
  }

  const { data: projectForGuard } = await supabase
    .from("projects")
    .select("status, review_cycle")
    .eq("id", review.project_id)
    .single();

  if (!projectForGuard) return { error: "This review is no longer valid." };
  if ((projectForGuard.review_cycle as number) !== review.review_cycle) {
    return { error: "This review is no longer valid — the project has moved to a new review cycle." };
  }
  // "revision_required" is allowed alongside "dispatched" — see the matching
  // comment in app/actions/approval.ts. It only means another stakeholder in
  // this cycle already rejected, not that this stakeholder's own pending
  // review is closed.
  const openStatuses = new Set(["dispatched", "revision_required"]);
  if (!openStatuses.has(projectForGuard.status as string)) {
    return { error: "This review is no longer valid — the project is no longer awaiting review." };
  }

  const now = new Date().toISOString();
  const newStatus =
    response === "approved"
      ? comments
        ? "approved_with_comments"
        : "approved_without_comments"
      : "rejected_with_comments";

  const { error: updateErr, count } = await supabase
    .from("stakeholder_reviews")
    .update({ status: newStatus, comments, responded_at: now }, { count: "exact" })
    .eq("id", review.id)
    .eq("status", "pending");

  if (updateErr) return { error: "Failed to record your response. Please try again." };
  if (count === 0) {
    return { error: "You have already submitted a response for this review." };
  }

  await supabase
    .from("projects")
    .update({ first_response_at: now, updated_at: now })
    .eq("id", review.project_id)
    .is("first_response_at", null);

  await auditLog("stakeholder.responded_via_portal", user.id as string, user.email as string, {
    projectId: review.project_id as string,
    metadata: {
      response: newStatus,
      review_cycle: review.review_cycle,
      stakeholder_email: review.stakeholder_email,
    },
  });

  const { data: project } = await supabase
    .from("projects")
    .select("review_cycle, extracted_fields, project_number, assigned_consultant_id, qa_completed_by")
    .eq("id", review.project_id)
    .single();

  if (!project) return { submitted: true, response };

  const projectRef = resolveProjectRef(project, review.project_id as string);
  const cycle = project.review_cycle as number;

  if (response === "rejected") {
    await supabase
      .from("projects")
      .update({ status: "revision_required", updated_at: now })
      .eq("id", review.project_id);

    // Bumps the PBDB revision_history counter (#108) — matches the equivalent
    // call in approval.ts and stakeholders.ts for the other two rejection paths.
    // Only the cycle's first rejection bumps it — see the matching guard there.
    if (projectForGuard.status !== "revision_required") {
      await recordRevisionEvent(supabase, review.project_id as string, "pbdb", "rejected");
    }

    await notifyModificationsRequested({
      supabase,
      projectId: review.project_id as string,
      reviewCycle: cycle,
      projectRef,
      stakeholderName: review.stakeholder_name as string,
      comments,
      qaCompletedBy: project.qa_completed_by as string | null,
      assignedConsultantId: project.assigned_consultant_id as string | null,
      messageVerb: "requested changes to",
      subjectLabel: "Changes requested",
    });
  } else {
    await notifyIfFullyApproved(
      supabase,
      review.project_id as string,
      cycle,
      "[submitPortalApproval]"
    );
  }

  // Confirm to the client that their response was recorded
  const clientName =
    [user.first_name as string | null, user.last_name as string | null]
      .filter(Boolean)
      .join(" ") || "there";
  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal/projects/${review.project_id}`;
  const confirmEmailHtml = renderReviewResponseConfirmationEmail({
    recipientName: clientName,
    projectRef,
    response,
    comments,
    portalUrl,
  });

  await notify({
    recipientId: user.id as string,
    type: "review_response_recorded",
    message: `Your ${response === "approved" ? "approval" : "change request"} for ${projectRef} has been recorded.`,
    projectId: review.project_id as string,
    emailSubject: `Review response recorded — ${projectRef}`,
    emailHtml: confirmEmailHtml,
  }).catch(() => {});

  return { submitted: true, response };
}
