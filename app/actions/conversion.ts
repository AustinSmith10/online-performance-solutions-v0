"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverPbdr } from "@/lib/documents/delivery";
import { auditLog } from "@/lib/audit/log";
import { deliverPbdrEmails } from "@/lib/documents/pbdr-delivery-email";

export type ConvertState = { error?: string; success?: boolean };

/**
 * Manual retry for PBDR conversion, for admins and the assigned consultant.
 * Auto-conversion fires from submitApproval when all stakeholders acknowledge.
 * This button is a fallback if that auto-trigger failed or is still staged
 * (e.g. waiting on a delivery-delay preset) and the project needs to go out now.
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

  const result = await deliverPbdr(projectId, actor.id, actor.email as string);

  if (!result.success) {
    return { error: result.reason ?? "Conversion failed. Please try again." };
  }

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
    .select("id, client_id, project_number, delivery_recipient_email, submitted_by")
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

  const { data: signed } = await supabase.storage
    .from("documents")
    .createSignedUrl(pbdrFile.storage_path as string, 30 * 24 * 3600);

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
