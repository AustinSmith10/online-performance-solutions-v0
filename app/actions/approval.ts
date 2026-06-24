"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { validateToken } from "@/lib/stakeholders/tokens";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { renderModificationsRequestedEmail } from "@/lib/email/templates/ModificationsRequestedEmail";
import { deliverPbdr } from "@/lib/documents/delivery";

export interface ApprovalState {
  error?: string;
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
    return { error: "This approval link has expired. Please contact DDEG for a new link." };

  const { review } = validated;
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Derive the four-state status from response + whether comments were provided
  const newStatus =
    response === "approved"
      ? comments ? "approved_with_comments" : "approved_without_comments"
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

  const projectRef =
    (project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ??
    (project.project_number as string | null) ??
    review.project_id.slice(0, 8);

  if (response === "rejected") {
    await supabase
      .from("projects")
      .update({ status: "revision_required", updated_at: now })
      .eq("id", review.project_id);

    // Aggregate all rejected reviews for this cycle (with or without comments)
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

    // Prefer the consultant who completed QA; fall back to currently assigned
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
          message: `${review.stakeholder_name} rejected ${projectRef}${comments ? ` — "${comments.slice(0, 80)}${comments.length > 80 ? "…" : ""}"` : "."}`,
          projectId: review.project_id,
          emailSubject: `Rejection received — ${projectRef}`,
          emailHtml,
        }).catch(() => {});
      })
    );
  } else {
    // Approved — check if all stakeholders for this cycle have approved (none pending, none rejected)
    const cycle = project.review_cycle as number;
    const { data: outstanding } = await supabase
      .from("stakeholder_reviews")
      .select("id")
      .eq("project_id", review.project_id)
      .eq("review_cycle", cycle)
      .in("status", ["pending", "rejected_with_comments", "rejected_without_comments"]);

    if (!outstanding || outstanding.length === 0) {
      // All stakeholders approved — auto-trigger PBDR conversion and delivery
      deliverPbdr(review.project_id, null, null).catch((err) => {
        console.error(`[submitApproval] auto-deliver-pbdr failed for ${review.project_id}:`, err);
      });
    }
  }

  return { submitted: true, response };
}
