"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { deliverPbdr } from "@/lib/documents/delivery";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { sendEmail } from "@/lib/email/sender";
import { renderPbdrDeliveryEmail } from "@/lib/email/templates/PBDRDeliveryEmail";

export type ConvertState = { error?: string; success?: boolean };

/**
 * Super Admin manual retry for PBDR conversion.
 * Auto-conversion fires from submitApproval when all stakeholders acknowledge.
 * This button is a fallback if that auto-trigger failed.
 */
export async function triggerPbdrConversion(
  projectId: string,
  _prev: ConvertState,
  _formData: FormData
): Promise<ConvertState> {
  const actor = await requireRole("super_admin", "admin");

  const result = await deliverPbdr(projectId, actor.id, actor.email as string);

  if (!result.success) {
    return { error: result.reason ?? "Conversion failed. Please try again." };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  return { success: true };
}

// ─── Resend PBDR delivery email ───────────────────────────────────────────────

export type ResendPbdrEmailState = { error?: string; sent?: boolean };

export async function resendPbdrEmail(
  projectId: string,
  _prev: ResendPbdrEmailState,
  _formData: FormData
): Promise<ResendPbdrEmailState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id, project_number, delivery_recipient_email, submitted_by")
    .eq("id", projectId)
    .in("status", ["delivered", "complete"])
    .is("deleted_at", null)
    .maybeSingle();

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

  const { data: submitter } = await supabase
    .from("users")
    .select("id, email, first_name, last_name")
    .eq("id", project.submitted_by as string)
    .maybeSingle();

  if (submitter) {
    const name =
      [(submitter.first_name as string | null), (submitter.last_name as string | null)]
        .filter(Boolean)
        .join(" ") || (submitter.email as string);

    await notify({
      recipientId: submitter.id as string,
      type: "pbdr_delivery",
      message: `Your PBDR for project ${projectRef} has been resent.`,
      projectId,
      emailSubject: `Your Performance Report — ${projectRef}`,
      emailHtml: renderPbdrDeliveryEmail({
        recipientName: name,
        projectId: projectRef,
        downloadUrl,
        expiresAt,
      }),
    }).catch((err) => console.warn("[resend-pbdr-email] submitter notify failed:", err));
  }

  const recipientEmail = project.delivery_recipient_email as string | null;
  if (recipientEmail) {
    const submitterEmail = (submitter?.email as string | null)?.toLowerCase();
    if (recipientEmail.toLowerCase() !== submitterEmail) {
      await sendEmail({
        to: recipientEmail,
        subject: `Your Performance Report — ${projectRef}`,
        html: renderPbdrDeliveryEmail({
          recipientName: recipientEmail,
          projectId: projectRef,
          downloadUrl,
          expiresAt,
        }),
      }).catch((err) => console.warn("[resend-pbdr-email] delivery_recipient email failed:", err));
    }
  }

  await auditLog("pbdr.redelivered", actor.id, actor.email as string, {
    projectId,
    orgId: project.org_id as string,
    metadata: { pbdr_version: pbdrFile.version, triggered_by: "admin_resend" },
  });

  revalidatePath(`/admin/projects/${projectId}`);
  return { sent: true };
}
