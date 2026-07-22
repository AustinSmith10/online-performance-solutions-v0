"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { dispatchPbdb } from "@/lib/stakeholders/dispatch";
import { deliverPbdr } from "@/lib/documents/delivery";
import { getOrCreateDispatchPdf } from "@/lib/documents/pbdb-pdf";
import { generateTokenString, computeTokenExpiry } from "@/lib/stakeholders/tokens";
import { sendEmail } from "@/lib/email/sender";
import { buildStakeholderReplyTo } from "@/lib/email/parser";
import { renderApprovalRequestEmail } from "@/lib/email/templates/ApprovalRequestEmail";
import { renderModificationsRequestedEmail } from "@/lib/email/templates/ModificationsRequestedEmail";
import { notify } from "@/lib/notifications/notify";
import { scheduleOrDeliverPbdr } from "@/lib/documents/pending-delivery";
import { attachEvidence } from "@/app/actions/evidence";
import { parseEmlBody } from "@/lib/email/parseEml";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StakeholderActionState {
  error?: string;
  saved?: boolean;
}

export interface WaiveState {
  error?: string;
}

// ─── Org stakeholder management ──────────────────────────────────────────────

export async function addOrgStakeholder(
  orgId: string,
  _prevState: StakeholderActionState,
  formData: FormData
): Promise<StakeholderActionState> {
  await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const name = (formData.get("name") as string | null)?.trim();
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const company = (formData.get("company") as string | null)?.trim() || null;

  if (!name || !email) return { error: "Name and email are required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Invalid email address." };

  const { data: existing } = await supabase
    .from("stakeholders")
    .select("id")
    .eq("scope", "org")
    .eq("scope_id", orgId)
    .ilike("email", email)
    .maybeSingle();
  if (existing) return { error: "A stakeholder with this email already exists for this org." };

  const { data: last } = await supabase
    .from("stakeholders")
    .select("sort_order")
    .eq("scope", "org")
    .eq("scope_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last?.sort_order as number | null) ?? -1) + 1;

  const { error } = await supabase.from("stakeholders").insert({
    scope: "org",
    scope_id: orgId,
    name,
    email,
    company,
    sort_order: sortOrder,
  });
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${orgId}`);
  return { saved: true };
}

export async function removeOrgStakeholder(
  orgId: string,
  stakeholderId: string
): Promise<void> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: stakeholder } = await supabase
    .from("stakeholders")
    .select("name, email")
    .eq("id", stakeholderId)
    .eq("scope", "org")
    .eq("scope_id", orgId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!stakeholder) return;

  await supabase
    .from("stakeholders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", stakeholderId);

  await auditLog("stakeholder.soft_deleted", actor.id, actor.email as string, {
    orgId,
    metadata: { stakeholderId, name: stakeholder.name, email: stakeholder.email },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/admin/recovery");
}

export async function restoreOrgStakeholder(
  orgId: string,
  stakeholderId: string
): Promise<void> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: stakeholder } = await supabase
    .from("stakeholders")
    .select("name, email")
    .eq("id", stakeholderId)
    .eq("scope", "org")
    .eq("scope_id", orgId)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (!stakeholder) return;

  await supabase
    .from("stakeholders")
    .update({ deleted_at: null })
    .eq("id", stakeholderId);

  await auditLog("stakeholder.restored", actor.id, actor.email as string, {
    orgId,
    metadata: { stakeholderId, name: stakeholder.name, email: stakeholder.email },
  });

  revalidatePath(`/admin/clients/${orgId}`);
  revalidatePath("/admin/recovery");
}

// ─── Project stakeholder management ──────────────────────────────────────────

export async function addProjectStakeholder(
  projectId: string,
  _prevState: StakeholderActionState,
  formData: FormData
): Promise<StakeholderActionState> {
  await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const name = (formData.get("name") as string | null)?.trim();
  const email = (formData.get("email") as string | null)?.trim().toLowerCase();
  const company = (formData.get("company") as string | null)?.trim() || null;

  if (!name || !email) return { error: "Name and email are required." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Invalid email address." };

  const { data: existing } = await supabase
    .from("stakeholders")
    .select("id")
    .eq("scope", "project")
    .eq("scope_id", projectId)
    .ilike("email", email)
    .maybeSingle();
  if (existing) return { error: "A stakeholder with this email already exists for this project." };

  const { data: last } = await supabase
    .from("stakeholders")
    .select("sort_order")
    .eq("scope", "project")
    .eq("scope_id", projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = ((last?.sort_order as number | null) ?? -1) + 1;

  const { error } = await supabase.from("stakeholders").insert({
    scope: "project",
    scope_id: projectId,
    name,
    email,
    company,
    sort_order: sortOrder,
  });
  if (error) return { error: error.message };

  revalidatePath(`/admin/projects/${projectId}`);
  return { saved: true };
}

export async function removeProjectStakeholder(
  projectId: string,
  stakeholderId: string
): Promise<void> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: stakeholder } = await supabase
    .from("stakeholders")
    .select("name, email")
    .eq("id", stakeholderId)
    .eq("scope", "project")
    .eq("scope_id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!stakeholder) return;

  await supabase
    .from("stakeholders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", stakeholderId);

  await auditLog("stakeholder.soft_deleted", actor.id, actor.email as string, {
    projectId,
    metadata: { stakeholderId, name: stakeholder.name, email: stakeholder.email },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/recovery");
}

export async function restoreProjectStakeholder(
  projectId: string,
  stakeholderId: string
): Promise<void> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: stakeholder } = await supabase
    .from("stakeholders")
    .select("name, email")
    .eq("id", stakeholderId)
    .eq("scope", "project")
    .eq("scope_id", projectId)
    .not("deleted_at", "is", null)
    .maybeSingle();

  if (!stakeholder) return;

  await supabase
    .from("stakeholders")
    .update({ deleted_at: null })
    .eq("id", stakeholderId);

  await auditLog("stakeholder.restored", actor.id, actor.email as string, {
    projectId,
    metadata: { stakeholderId, name: stakeholder.name, email: stakeholder.email },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/recovery");
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

export interface DispatchState {
  error?: string;
  dispatched?: boolean;
}

export async function dispatchToStakeholders(
  projectId: string,
  _prevState: DispatchState,
  _formData: FormData
): Promise<DispatchState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("status, qa_completed_by")
    .eq("id", projectId)
    .maybeSingle();

  if (!project || project.status !== "in_progress" || !project.qa_completed_by) {
    return { error: "Project is not ready for dispatch." };
  }

  try {
    await dispatchPbdb(projectId, actor.id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Dispatch failed." };
  }

  redirect(`/admin/projects/${projectId}?dispatched=1`);
}

// ─── Waive stakeholder ────────────────────────────────────────────────────────

export async function waiveStakeholderResponse(
  reviewId: string,
  projectId: string,
  _prevState: WaiveState,
  formData: FormData
): Promise<WaiveState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const reason = (formData.get("reason") as string | null)?.trim();
  if (!reason || reason.length < 10) {
    return { error: "A written reason of at least 10 characters is required." };
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("stakeholder_reviews")
    .update({
      status: "waived",
      waived_by: actor.id,
      waive_reason: reason,
      waived_at: now,
      responded_at: now,
    })
    .eq("id", reviewId)
    .eq("project_id", projectId)
    .eq("status", "pending");

  if (error) return { error: error.message };

  await auditLog("stakeholder.waived", actor.id, actor.email as string, {
    projectId,
    metadata: { review_id: reviewId, reason },
  });

  // Check if all reviews for this cycle are now complete
  const { data: project } = await supabase
    .from("projects")
    .select("review_cycle")
    .eq("id", projectId)
    .single();

  if (project) {
    const cycle = project.review_cycle as number;
    const { data: outstanding } = await supabase
      .from("stakeholder_reviews")
      .select("id")
      .eq("project_id", projectId)
      .eq("review_cycle", cycle)
      .in("status", ["pending", "rejected_with_comments", "rejected_without_comments"]);

    if (!outstanding || outstanding.length === 0) {
      // All stakeholders approved or waived — auto-trigger PBDR conversion and delivery
      deliverPbdr(projectId, actor.id, actor.email as string).catch((err) => {
        console.error(`[waiveStakeholderResponse] auto-deliver-pbdr failed for ${projectId}:`, err);
      });
    }
  }

  redirect(`/admin/projects/${projectId}?review_waived=1`);
}

// ─── Resend fresh token ───────────────────────────────────────────────────────

export interface ResendTokenState {
  error?: string;
  sent?: boolean;
}

export async function resendFreshToken(
  reviewId: string,
  projectId: string,
  _prevState: ResendTokenState,
  _formData: FormData
): Promise<ResendTokenState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: review } = await supabase
    .from("stakeholder_reviews")
    .select("id, stakeholder_email, stakeholder_name, status")
    .eq("id", reviewId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!review || (review.status as string) !== "pending") {
    return { error: "Review not found or not pending." };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("client_id, review_cycle, strip_token_color, clients(state_territory), extracted_fields, project_number")
    .eq("id", projectId)
    .single();

  const stateTerritory =
    (project?.clients as unknown as { state_territory: string | null } | null)
      ?.state_territory ?? null;

  const token = generateTokenString();
  const expiresAt = await computeTokenExpiry(new Date(), stateTerritory);
  const expiresFormatted = expiresAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  await supabase
    .from("stakeholder_reviews")
    .update({
      token,
      expires_at: expiresAt.toISOString(),
      fresh_token_sent_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/approve/${token}`;

  const pbdbPdf = project
    ? await getOrCreateDispatchPdf(
        supabase,
        {
          id: projectId,
          client_id: project.client_id as string,
          review_cycle: project.review_cycle as number,
          strip_token_color: project.strip_token_color as boolean | null,
        },
        actor.id
      )
    : null;

  const pbdbUrl = pbdbPdf
    ? await supabase.storage
        .from("documents")
        .createSignedUrl(pbdbPdf.storagePath, 7 * 24 * 3600)
        .then((r) => r.data?.signedUrl ?? null)
    : null;

  const emailHtml = renderApprovalRequestEmail({
    stakeholderName: review.stakeholder_name as string,
    projectId: projectId.slice(0, 8),
    approvalUrl,
    expiresAt: expiresFormatted,
    pbdbUrl,
    isFreshToken: true,
  });

  const replyTo = buildStakeholderReplyTo(token);

  await sendEmail({
    to: review.stakeholder_email as string,
    subject: `Reminder: approval required (ref: ${projectId.slice(0, 8)})`,
    html: emailHtml,
    source: "stakeholder_resend_token",
    projectId,
    ...(replyTo ? { replyTo } : {}),
  }).catch((err) => {
    console.error(`[resend-token] email to ${review.stakeholder_email} failed:`, err);
  });

  await auditLog("stakeholder.token_resent", actor.id, actor.email as string, {
    projectId,
    metadata: { review_id: reviewId, email: review.stakeholder_email },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { sent: true };
}

// ─── Update stakeholder email + resend ────────────────────────────────────────

export interface UpdateEmailState {
  error?: string;
}

export async function updateStakeholderEmail(
  reviewId: string,
  projectId: string,
  _prevState: UpdateEmailState,
  formData: FormData
): Promise<UpdateEmailState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const newEmail = (formData.get("email") as string | null)?.trim().toLowerCase();
  if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { error: "Valid email address required." };
  }

  const { data: review } = await supabase
    .from("stakeholder_reviews")
    .select("id, stakeholder_name, status")
    .eq("id", reviewId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!review || (review.status as string) !== "pending") {
    return { error: "Review not found or not pending." };
  }

  await supabase
    .from("stakeholder_reviews")
    .update({ stakeholder_email: newEmail })
    .eq("id", reviewId);

  await auditLog("stakeholder.email_updated", actor.id, actor.email as string, {
    projectId,
    metadata: { review_id: reviewId, new_email: newEmail },
  });

  // Resend the token to the new email address
  const { data: project } = await supabase
    .from("projects")
    .select("client_id, review_cycle, strip_token_color, clients(state_territory)")
    .eq("id", projectId)
    .single();

  const stateTerritory =
    (project?.clients as unknown as { state_territory: string | null } | null)
      ?.state_territory ?? null;

  const token = generateTokenString();
  const expiresAt = await computeTokenExpiry(new Date(), stateTerritory);
  const expiresFormatted = expiresAt.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  await supabase
    .from("stakeholder_reviews")
    .update({
      token,
      expires_at: expiresAt.toISOString(),
      fresh_token_sent_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/approve/${token}`;

  const pbdbPdf = project
    ? await getOrCreateDispatchPdf(
        supabase,
        {
          id: projectId,
          client_id: project.client_id as string,
          review_cycle: project.review_cycle as number,
          strip_token_color: project.strip_token_color as boolean | null,
        },
        actor.id
      )
    : null;

  const pbdbUrl = pbdbPdf
    ? await supabase.storage
        .from("documents")
        .createSignedUrl(pbdbPdf.storagePath, 7 * 24 * 3600)
        .then((r) => r.data?.signedUrl ?? null)
    : null;

  const emailHtml = renderApprovalRequestEmail({
    stakeholderName: review.stakeholder_name as string,
    projectId: projectId.slice(0, 8),
    approvalUrl,
    expiresAt: expiresFormatted,
    pbdbUrl,
    isFreshToken: true,
  });

  await sendEmail({
    to: newEmail,
    subject: `Approval required — PBDB review (ref: ${projectId.slice(0, 8)})`,
    html: emailHtml,
    source: "stakeholder_update_email",
    projectId,
  }).catch((err) => {
    console.error(`[update-email] email to ${newEmail} failed:`, err);
  });

  redirect(`/admin/projects/${projectId}?email_updated=${reviewId}`);
}

// ─── Log a decision on a stakeholder's behalf (#65) ───────────────────────────
// For stakeholders who reply out-of-band (phone, email) instead of using the
// portal. Requires an attached evidence file (#57) and, once recorded, has
// the same downstream effect as that stakeholder approving/rejecting via the
// portal themselves — see submitPortalApproval in app/actions/portalApproval.ts,
// which this mirrors.

export interface LogResponseState {
  error?: string;
  success?: boolean;
}

export async function logStakeholderResponseOnBehalf(
  reviewId: string,
  projectId: string,
  response: "approved" | "rejected",
  comments: string | null,
  storagePath: string,
  filename: string
): Promise<LogResponseState> {
  const actor = await requireRole("consultant", "admin", "super_admin");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, assigned_consultant_id, status, review_cycle")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) return { error: "Project not found." };
  if (actor.role === "consultant" && project.assigned_consultant_id !== actor.id) {
    return { error: "Access denied." };
  }

  if (response !== "approved" && response !== "rejected") {
    return { error: "Select approve or reject." };
  }
  const trimmedComments = comments?.trim() || null;
  if (response === "rejected" && !trimmedComments) {
    return { error: "Comments are required — describe what the stakeholder said." };
  }

  const { data: review } = await supabase
    .from("stakeholder_reviews")
    .select("id, project_id, stakeholder_name, stakeholder_email, status, review_cycle")
    .eq("id", reviewId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (!review) return { error: "Review not found." };
  if ((review.status as string) !== "pending") {
    return { error: "This review has already been responded to." };
  }
  if ((review.review_cycle as number) !== (project.review_cycle as number)) {
    return { error: "This review is no longer valid — the project has moved to a new review cycle." };
  }
  if ((project.status as string) !== "dispatched") {
    return { error: "This project is no longer awaiting review." };
  }

  // Mandatory evidence attachment, linked to this specific review event
  // (not just a generic project attachment) via the `reference` string.
  const evidenceResult = await attachEvidence(
    projectId,
    storagePath,
    filename,
    `stakeholder_review:${reviewId}`
  );
  if (evidenceResult.error) return { error: evidenceResult.error };

  const { data: evidenceFile } = await supabase
    .from("project_files")
    .select("id")
    .eq("project_id", projectId)
    .eq("storage_path", storagePath)
    .maybeSingle();

  const now = new Date().toISOString();
  const newStatus =
    response === "approved"
      ? trimmedComments
        ? "approved_with_comments"
        : "approved_without_comments"
      : "rejected_with_comments";

  const { error: updateErr, count } = await supabase
    .from("stakeholder_reviews")
    .update({ status: newStatus, comments: trimmedComments, responded_at: now }, { count: "exact" })
    .eq("id", reviewId)
    .eq("status", "pending");

  if (updateErr) return { error: "Failed to record the response. Please try again." };
  if (count === 0) return { error: "This review has already been responded to." };

  await auditLog("stakeholder.responded_on_behalf", actor.id, actor.email as string, {
    projectId,
    metadata: {
      review_id: reviewId,
      response: newStatus,
      stakeholder_email: review.stakeholder_email,
      stakeholder_name: review.stakeholder_name,
      evidence_file_id: evidenceFile?.id ?? null,
      reference: `stakeholder_review:${reviewId}`,
    },
  });

  await supabase
    .from("projects")
    .update({ first_response_at: now, updated_at: now })
    .eq("id", projectId)
    .is("first_response_at", null);

  const { data: projectDetail } = await supabase
    .from("projects")
    .select("review_cycle, extracted_fields, project_number, assigned_consultant_id, qa_completed_by")
    .eq("id", projectId)
    .single();

  if (projectDetail) {
    const cycle = projectDetail.review_cycle as number;
    const projectRef =
      (projectDetail.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ??
      (projectDetail.project_number as string | null) ??
      projectId.slice(0, 8);

    if (response === "rejected") {
      await supabase
        .from("projects")
        .update({ status: "revision_required", updated_at: now })
        .eq("id", projectId);

      const { data: allRejected } = await supabase
        .from("stakeholder_reviews")
        .select("stakeholder_name, comments")
        .eq("project_id", projectId)
        .eq("review_cycle", cycle)
        .in("status", ["rejected_with_comments", "rejected_without_comments"]);

      const modifications = (allRejected ?? [])
        .filter((r) => r.comments)
        .map((r) => ({
          stakeholderName: r.stakeholder_name as string,
          comments: r.comments as string,
        }));

      const consultantId =
        (projectDetail.qa_completed_by as string | null) ??
        (projectDetail.assigned_consultant_id as string | null);
      const recipientIds: string[] = [...(consultantId ? [consultantId] : [])];
      const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
      for (const a of admins ?? []) recipientIds.push(a.id as string);

      const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ops/projects/${projectId}`;
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
            message: `${review.stakeholder_name} requested changes to ${projectRef}${trimmedComments ? ` — "${trimmedComments.slice(0, 80)}${trimmedComments.length > 80 ? "…" : ""}"` : "."}`,
            projectId,
            emailSubject: `Changes requested — ${projectRef}`,
            emailHtml,
          }).catch(() => {});
        })
      );
    } else {
      const { data: pending } = await supabase
        .from("stakeholder_reviews")
        .select("id")
        .eq("project_id", projectId)
        .eq("review_cycle", cycle)
        .eq("status", "pending");

      if (!pending || pending.length === 0) {
        scheduleOrDeliverPbdr(projectId).catch((err) => {
          console.error(`[logStakeholderResponseOnBehalf] auto-deliver-pbdr failed for ${projectId}:`, err);
        });
      }
    }
  }

  revalidatePath(`/ops/projects/${projectId}`);
  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}

// ─── Extract comments from an uploaded email (#65, optional AI convenience) ──
// Pure convenience read — no DB writes, no audit log. The consultant always
// reviews and edits the result before submitting; this never determines the
// approve/reject decision.

export type ExtractEmailResult = { text: string } | { error: string };

export async function extractStakeholderCommentsFromEmail(
  emlText: string
): Promise<ExtractEmailResult> {
  await requireRole("consultant", "admin", "super_admin");

  const body = parseEmlBody(emlText).slice(0, 8000).trim();
  if (!body) return { error: "Could not find any text in this email." };

  const prompt = `Below is the body of an email a stakeholder sent about a building compliance document review.

--- EMAIL BODY ---
${body}

Extract only the substantive message the sender wrote — their actual reply — with quoted previous messages, signatures, and disclaimers removed. Return the extracted text only, as plain text, with no explanation, preamble, or formatting.`;

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import("@anthropic-ai/sdk")).default;
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
      if (text) return { text };
    } catch (err) {
      console.error("[extractStakeholderCommentsFromEmail] Anthropic failed, falling back to OpenAI:", err);
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const OpenAI = (await import("openai")).default;
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1024,
        temperature: 0,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.choices[0]?.message?.content?.trim() ?? "";
      if (text) return { text };
    } catch (err) {
      console.error("[extractStakeholderCommentsFromEmail] OpenAI also failed:", err);
    }
  }

  return { text: body };
}

