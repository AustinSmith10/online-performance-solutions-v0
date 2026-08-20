"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleOrDeliverPbdr } from "@/lib/documents/pending-delivery";
import { auditLog } from "@/lib/audit/log";
import { deliverPbdrEmails } from "@/lib/documents/pbdr-delivery-email";
import { recordRevisionEvent } from "@/lib/documents/revision-history";
import { buildPbdrPreview, type PbdrPreviewProject } from "@/lib/documents/pbdr-preview";
import { computeSignedUrlExpirySeconds } from "@/lib/stakeholders/tokens";

export type ConvertState = { error?: string; success?: boolean; scheduledFor?: string | null };

// ─── Preview the PBDR before converting ────────────────────────────────────

export type PbdrPreviewResult = { error: string } | { url: string; filename: string };

/**
 * Lets an admin/consultant see what the PBDR will look like before they
 * commit to Convert & deliver — renders the same transform deliverPbdr()
 * uses (lib/documents/pbdr-preview.ts) without any of its side effects.
 * Computed lazily on click since conversion has a real cost.
 */
export async function getPbdrPreviewUrl(projectId: string): Promise<PbdrPreviewResult> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  let query = supabase
    .from("projects")
    .select(
      "id, client_id, review_cycle, strip_token_color, project_number, extracted_fields, assigned_consultant_id"
    )
    .eq("id", projectId)
    .is("deleted_at", null);
  if (actor.role === "consultant") {
    query = query.eq("assigned_consultant_id", actor.id);
  }
  const { data: project } = await query.maybeSingle();
  if (!project) return { error: "Project not found or access denied." };

  let preview;
  try {
    preview = await buildPbdrPreview(supabase, project as unknown as PbdrPreviewProject);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to generate preview." };
  }
  if (!preview) return { error: "No QA'd PBDB found for this project's current cycle." };

  const { data: signed, error: signErr } = await supabase.storage
    .from("documents")
    .createSignedUrl(preview.storagePath, 900);
  if (signErr || !signed) return { error: "Failed to sign preview URL." };

  return { url: signed.signedUrl, filename: preview.originalFilename };
}

/**
 * Admin/consultant-triggered PBDR conversion — the only trigger. Full
 * stakeholder approval no longer auto-converts (see notifyIfFullyApproved in
 * lib/stakeholders/review-outcome.ts); the admin/consultant picks the
 * project's delivery timing preset first, then clicks Convert, and that
 * preset governs whether this delivers now or stages for later release by
 * the worker cron (lib/documents/pending-delivery.ts).
 */
export async function triggerPbdrConversion(
  projectId: string,
  _prev: ConvertState,
  _formData: FormData
): Promise<ConvertState> {
  const actor = await requireRole("consultant", "super_admin", "admin");

  if (actor.role === "consultant") {
    const supabase = createAdminClient();
    const { data: project } = await supabase
      .from("projects")
      .select("assigned_consultant_id")
      .eq("id", projectId)
      .maybeSingle();
    if (project?.assigned_consultant_id !== actor.id) {
      return { error: "You are not assigned to this project." };
    }
  }

  try {
    const result = await scheduleOrDeliverPbdr(projectId, actor.id, actor.email as string);
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath(`/ops/projects/${projectId}`);
    return { success: true, scheduledFor: result.scheduledFor };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Conversion failed. Please try again." };
  }
}

// ─── Revert a delivered PBDR back to the PBDB QA cycle ────────────────────────

export type RevertState = { error?: string; success?: boolean };

/**
 * A stakeholder finds an issue after the PBDR has already been delivered —
 * this sends the project back to the same revision_required cycle a
 * stakeholder rejection produces: the consultant downloads the PBDB that was
 * actually converted (still the latest pbdb project_files row, since
 * nothing has replaced it since conversion), corrects it, and re-uploads
 * through the existing QA cycle. That reupload naturally re-dispatches for
 * approval and can convert to PBDR again — recordRevisionEvent's
 * peekNextRevNumber means the resulting PBDR gets its own new row (Rev1,
 * Rev2, ...) rather than overwriting the original, so both conversions stay
 * in the audit trail. See lib/documents/revision-history.ts.
 */
export async function revertPbdrToPbdb(
  projectId: string,
  _prev: RevertState,
  formData: FormData
): Promise<RevertState> {
  const actor = await requireRole("consultant", "super_admin", "admin");
  const reason = (formData.get("reason") as string | null)?.trim() ?? "";
  if (!reason) return { error: "A reason is required to revert to PBDB." };

  const supabase = createAdminClient();

  let projectQuery = supabase
    .from("projects")
    .select("id, client_id, status, assigned_consultant_id")
    .eq("id", projectId)
    .in("status", ["delivered", "complete"])
    .is("deleted_at", null);
  if (actor.role === "consultant") {
    projectQuery = projectQuery.eq("assigned_consultant_id", actor.id);
  }
  const { data: project } = await projectQuery.maybeSingle();
  if (!project) return { error: "Project not found or not yet delivered." };

  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("projects")
    .update({ status: "revision_required", updated_at: now })
    .eq("id", projectId);
  if (updateErr) return { error: updateErr.message };

  // Bumps the PBDB revision_history counter (#108) — the corrected reupload
  // later derives its Rev{n} filename from this row, same as a rejection.
  await recordRevisionEvent(supabase, projectId, "pbdb", "reverted");

  await auditLog("project.reverted_to_pbdb", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: { reason, triggered_by: actor.role },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath(`/ops/projects/${projectId}`);
  return { success: true };
}

// ─── Resend PBDR delivery email ───────────────────────────────────────────────

export type ResendPbdrEmailState = { error?: string; sent?: boolean };

export async function resendPbdrEmail(
  projectId: string,
  _prev: ResendPbdrEmailState,
  _formData: FormData
): Promise<ResendPbdrEmailState> {
  const actor = await requireRole("super_admin", "admin", "consultant");
  const supabase = createAdminClient();

  let projectQuery = supabase
    .from("projects")
    .select(
      "id, client_id, project_number, delivery_recipient_email, submitted_by, clients(state_territory)"
    )
    .eq("id", projectId)
    .in("status", ["delivered", "complete"])
    .is("deleted_at", null);
  if (actor.role === "consultant") {
    projectQuery = projectQuery.eq("assigned_consultant_id", actor.id);
  }

  const { data: project } = await projectQuery.maybeSingle();

  if (!project) return { error: "Project not found or not yet delivered." };

  const { data: pbdrFile } = await supabase
    .from("project_files")
    .select("storage_path, version")
    .eq("project_id", projectId)
    .eq("file_type", "pbdr")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pbdrFile) return { error: "No PBDR file found for this project." };

  const stateTerritory =
    (project.clients as unknown as { state_territory: string | null } | null)?.state_territory ?? null;

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(
      pbdrFile.storage_path as string,
      await computeSignedUrlExpirySeconds(new Date(), stateTerritory)
    );

  if (!signed?.signedUrl) return { error: "Failed to generate download link." };

  const downloadUrl = signed.signedUrl;
  const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toLocaleDateString("en-AU", {
    day: "numeric", month: "long", year: "numeric",
  });
  const projectRef = (project.project_number as string | null)
    ? `${project.project_number as string}-S`
    : projectId.slice(0, 8);

  await deliverPbdrEmails({
    supabase,
    projectId,
    templateProjectRef: projectRef,
    submittedBy: project.submitted_by as string | null,
    deliveryRecipientEmail: project.delivery_recipient_email as string | null,
    downloadUrl,
    expiresAt,
    subject: `Your Performance Report — ${projectRef}`,
    notifyTitle: "Report resent",
    notifyMessage: `Your PBDR for project ${projectRef} has been resent.`,
    recipientEmailSource: "conversion_resend_delivery_recipient",
    logPrefix: "[resend-pbdr-email]",
  });

  await auditLog("pbdr.redelivered", actor.id, actor.email as string, {
    projectId,
    orgId: project.client_id as string,
    metadata: { pbdr_version: pbdrFile.version, triggered_by: `${actor.role}_resend` },
  });

  const basePath = actor.role === "consultant" ? "/ops/projects" : "/admin/projects";
  redirect(`${basePath}/${projectId}?pbdr_resent=1`);
}
