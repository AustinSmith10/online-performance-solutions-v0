"use server";

import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { renderModificationsRequestedEmail } from "@/lib/email/templates/ModificationsRequestedEmail";
import { renderReviewResponseConfirmationEmail } from "@/lib/email/templates/ReviewResponseConfirmationEmail";
import { deliverPbdr } from "@/lib/documents/delivery";

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
  const user = await requireRole("client");

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

  const now = new Date().toISOString();
  const newStatus =
    response === "approved"
      ? comments
        ? "approved_with_comments"
        : "approved_without_comments"
      : "rejected_with_comments";

  const { error: updateErr } = await supabase
    .from("stakeholder_reviews")
    .update({ status: newStatus, comments, responded_at: now })
    .eq("id", review.id);

  if (updateErr) return { error: "Failed to record your response. Please try again." };

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

  const projectRef =
    (project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ??
    (project.project_number as string | null) ??
    (review.project_id as string).slice(0, 8);

  if (response === "rejected") {
    await supabase
      .from("projects")
      .update({ status: "revision_required", updated_at: now })
      .eq("id", review.project_id);

    const cycle = project.review_cycle as number;
    const { data: allRejected } = await supabase
      .from("stakeholder_reviews")
      .select("stakeholder_name, comments")
      .eq("project_id", review.project_id)
      .eq("review_cycle", cycle)
      .in("status", ["rejected_with_comments", "rejected_without_comments"]);

    const modifications = (allRejected ?? [])
      .filter((r) => r.comments)
      .map((r) => ({
        stakeholderName: r.stakeholder_name as string,
        comments: r.comments as string,
      }));

    const consultantId =
      (project.qa_completed_by as string | null) ??
      (project.assigned_consultant_id as string | null);
    const recipientIds: string[] = [...(consultantId ? [consultantId] : [])];
    const { data: admins } = await supabase.from("users").select("id").eq("role", "super_admin");
    for (const a of admins ?? []) recipientIds.push(a.id as string);

    const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ops/projects/${review.project_id}`;
    const { data: recipientRows } = await supabase
      .from("users")
      .select("id, first_name")
      .in("id", recipientIds);

    await Promise.all(
      (recipientRows ?? []).map((u) => {
        const firstName = (u.first_name as string | null) ?? "there";
        const emailHtml = renderModificationsRequestedEmail({
          consultantName: firstName,
          projectId: projectRef,
          modifications,
          projectUrl,
        });
        return notify({
          recipientId: u.id as string,
          type: "modifications_requested",
          message: `${review.stakeholder_name} requested changes to ${projectRef}${comments ? ` — "${comments.slice(0, 80)}${comments.length > 80 ? "…" : ""}"` : "."}`,
          projectId: review.project_id as string,
          emailSubject: `Changes requested — ${projectRef}`,
          emailHtml,
        }).catch(() => {});
      })
    );
  } else {
    const cycle = project.review_cycle as number;
    const { data: pending } = await supabase
      .from("stakeholder_reviews")
      .select("id")
      .eq("project_id", review.project_id)
      .eq("review_cycle", cycle)
      .eq("status", "pending");

    if (!pending || pending.length === 0) {
      deliverPbdr(review.project_id as string, null, null).catch((err) => {
        console.error(`[submitPortalApproval] auto-deliver-pbdr failed for ${review.project_id}:`, err);
      });
    }
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
