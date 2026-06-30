"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { dispatchPbdb } from "@/lib/stakeholders/dispatch";
import { deliverPbdr } from "@/lib/documents/delivery";
import { generateTokenString, computeTokenExpiry } from "@/lib/stakeholders/tokens";
import { sendEmail } from "@/lib/email/sender";
import { renderApprovalRequestEmail } from "@/lib/email/templates/ApprovalRequestEmail";

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

  revalidatePath(`/admin/organisations/${orgId}`);
  return { saved: true };
}

export async function removeOrgStakeholder(
  orgId: string,
  stakeholderId: string
): Promise<void> {
  await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  await supabase
    .from("stakeholders")
    .delete()
    .eq("id", stakeholderId)
    .eq("scope", "org")
    .eq("scope_id", orgId);

  revalidatePath(`/admin/organisations/${orgId}`);
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
  await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  await supabase
    .from("stakeholders")
    .delete()
    .eq("id", stakeholderId)
    .eq("scope", "project")
    .eq("scope_id", projectId);

  revalidatePath(`/admin/projects/${projectId}`);
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
    .select("organisations(state_territory), extracted_fields, project_number")
    .eq("id", projectId)
    .single();

  const stateTerritory =
    (project?.organisations as unknown as { state_territory: string | null } | null)
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

  const { data: pbdbFile } = await supabase
    .from("project_files")
    .select("storage_path")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pbdbUrl = pbdbFile
    ? await supabase.storage
        .from("documents")
        .createSignedUrl(pbdbFile.storage_path as string, 7 * 24 * 3600)
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
    to: review.stakeholder_email as string,
    subject: `Reminder: approval required (ref: ${projectId.slice(0, 8)})`,
    html: emailHtml,
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
    .select("organisations(state_territory)")
    .eq("id", projectId)
    .single();

  const stateTerritory =
    (project?.organisations as unknown as { state_territory: string | null } | null)
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

  const { data: pbdbFile } = await supabase
    .from("project_files")
    .select("storage_path")
    .eq("project_id", projectId)
    .eq("file_type", "pbdb")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const pbdbUrl = pbdbFile
    ? await supabase.storage
        .from("documents")
        .createSignedUrl(pbdbFile.storage_path as string, 7 * 24 * 3600)
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
  }).catch((err) => {
    console.error(`[update-email] email to ${newEmail} failed:`, err);
  });

  redirect(`/admin/projects/${projectId}?email_updated=${reviewId}`);
}

