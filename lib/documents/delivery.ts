import { createAdminClient } from "@/lib/supabase/admin";
import { checkPbdrGate } from "@/lib/payments/gate";
import { convertPbdbToPbdr } from "@/lib/documents/converter";
import { stripRedTokenColor } from "@/lib/documents/color-strip";
import { convertDocxToPdf } from "@/lib/documents/pdf";
import { buildPbdrFilename } from "@/lib/documents/naming";
import { formatAddress } from "@/lib/documents/formatters";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { sendEmail } from "@/lib/email/sender";
import { renderPbdrDeliveryEmail } from "@/lib/email/templates/PBDRDeliveryEmail";
import { renderEmailShell, e, paragraph, strong, noticeBox } from "@/lib/email/templates/shell";

export interface DeliverPbdrResult {
  success: boolean;
  reason?: string;
}

/**
 * Core PBDB→PBDR conversion and delivery pipeline.
 *
 * Called from:
 *   - Auto-trigger: submitApproval when all stakeholders acknowledge
 *   - Manual trigger: triggerPbdrConversion server action (Super Admin button)
 *
 * actorId / actorEmail may be null for system-triggered runs (audit log
 * records them as system events). Falls back to the first super admin ID
 * for foreign-key fields that require a user reference.
 *
 * Returns { success: false, reason } rather than throwing so callers can
 * decide whether to surface the error or just log it.
 */
export async function deliverPbdr(
  projectId: string,
  actorId: string | null,
  actorEmail: string | null
): Promise<DeliverPbdrResult> {
  const supabase = createAdminClient();

  // Resolve a valid user ID for FK fields — use actorId if provided, else first super admin
  let fileUploadedBy = actorId;
  if (!fileUploadedBy) {
    const { data: admins } = await supabase
      .from("users")
      .select("id")
      .in("role", ["super_admin", "admin"])
      .limit(1);
    fileUploadedBy = (admins?.[0]?.id as string | undefined) ?? null;
  }
  if (!fileUploadedBy) {
    return { success: false, reason: "No admin user found for system delivery." };
  }

  // Load project
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, client_id, status, project_number, extracted_fields, delivery_recipient_email, submitted_by, assigned_consultant_id, review_cycle, strip_token_color")
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();

  if (projErr || !project) return { success: false, reason: "Project not found." };
  if ((project.status as string) !== "dispatched") {
    return { success: false, reason: `Project is in ${project.status} status, expected dispatched.` };
  }

  // Hard gates
  const gate = await checkPbdrGate(projectId);
  if (!gate.allowed) {
    const reason = !gate.creditDeducted
      ? "Credit has not been deducted (or payment override applied)."
      : "Not all stakeholders have acknowledged.";
    const html = renderEmailShell({
      status: "error",
      statusLabel: "Blocked",
      heading: "PBDR conversion blocked",
      bodyHtml:
        paragraph(
          `Conversion could not start for project ${strong(projectId.slice(0, 8))}.`
        ) + noticeBox(e(reason), "error"),
    });
    const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
    await Promise.all(
      (admins ?? []).map((u: { id: string }) =>
        notify({
          recipientId: u.id,
          type: "system_error",
          message: `PBDR conversion blocked: ${reason}`,
          projectId,
          emailSubject: `PBDR conversion blocked — ${projectId.slice(0, 8)}`,
          emailHtml: html,
        }).catch(() => {})
      )
    );
    return { success: false, reason };
  }

  // Claim the project atomically — concurrent calls will skip if already converting
  const conversionStart = new Date();
  const { error: statusErr, count } = await supabase
    .from("projects")
    .update({ status: "converting", updated_at: conversionStart.toISOString() }, { count: "exact" })
    .eq("id", projectId)
    .eq("status", "dispatched");

  if (statusErr || count === 0) {
    return { success: false, reason: "Conversion already in progress or project no longer dispatched." };
  }

  let pdfStoragePath: string | null = null;
  let pbdbVersion: number | null = null;
  let pbdrVersion: number | null = null;

  try {
    // Load the QA'd PBDB for the final-approved cycle (highest version within it) —
    // scoping by review_cycle avoids accidentally converting a stale earlier cycle's
    // docx if one were ever left behind.
    const { data: pbdbFile } = await supabase
      .from("project_files")
      .select("storage_path, version")
      .eq("project_id", projectId)
      .eq("file_type", "pbdb")
      .eq("review_cycle", project.review_cycle as number)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pbdbFile) throw new Error("QA'd PBDB not found in storage.");
    pbdbVersion = (pbdbFile.version as number | null) ?? null;

    const { data: docxBlob, error: dlErr } = await supabase.storage
      .from("documents")
      .download(pbdbFile.storage_path as string);

    if (dlErr || !docxBlob) {
      throw new Error(`Failed to download PBDB: ${dlErr?.message ?? "unknown"}`);
    }

    const pbdbBuffer = Buffer.from(await docxBlob.arrayBuffer());

    // Apply 8 text transformations + strip watermarks from headers
    let transformedDocx = convertPbdbToPbdr(pbdbBuffer);

    // Strip red token colour if enabled (default on)
    if (project.strip_token_color as boolean) {
      transformedDocx = stripRedTokenColor(transformedDocx);
    }

    // Generate PDF via Gotenberg (60 s hard timeout enforced inside)
    const pdfBuffer = await convertDocxToPdf(transformedDocx);

    // Build PBDR filename
    const rawAddress =
      (project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ?? "";
    const address = formatAddress(rawAddress);

    // R[n] on the PBDR mirrors the PBDB: counts completed stakeholder revision cycles.
    // review_cycle starts at 1 and increments only when a revision is submitted, so
    // review_cycle - 1 gives the correct R[n] at the point of approval.
    const revisionIndex = (project.review_cycle as number) - 1;
    pbdrVersion = revisionIndex + 1;

    const pbdrFilename = buildPbdrFilename(
      (project.project_number as string | null) ?? projectId.slice(0, 8),
      revisionIndex,
      address,
      conversionStart
    );

    pdfStoragePath = `${project.client_id as string}/${projectId}/pbdr/${pbdrFilename}`;

    const { error: uploadErr } = await supabase.storage
      .from("documents")
      .upload(pdfStoragePath, pdfBuffer, { contentType: "application/pdf" });

    if (uploadErr) throw new Error(`Failed to store PBDR: ${uploadErr.message}`);

    const { error: insertErr } = await supabase.from("project_files").insert({
      project_id: projectId,
      file_type: "pbdr",
      storage_path: pdfStoragePath,
      original_filename: pbdrFilename,
      uploaded_by: fileUploadedBy,
      version: revisionIndex + 1,
    });

    if (insertErr) {
      await supabase.storage.from("documents").remove([pdfStoragePath]);
      pdfStoragePath = null;
      throw new Error(`Failed to record PBDR: ${insertErr.message}`);
    }

    // Signed URL valid for 30 days — embedded in delivery emails
    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(pdfStoragePath, 30 * 24 * 3600);
    const downloadUrl = signed?.signedUrl ?? null;
    const expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    // Deliver to submitter via notify() — writes in-app notification + sends email
    const { data: submitter } = await supabase
      .from("users")
      .select("id, email, first_name, last_name")
      .eq("id", project.submitted_by as string)
      .maybeSingle();

    if (submitter && downloadUrl) {
      const firstName = (submitter.first_name as string | null) ?? "";
      const lastName = (submitter.last_name as string | null) ?? "";
      const recipientName =
        [firstName, lastName].filter(Boolean).join(" ") || (submitter.email as string);
      await notify({
        recipientId: submitter.id as string,
        type: "pbdr_delivery",
        message: `Your PBDR for project ${projectId.slice(0, 8)} has been delivered.`,
        projectId,
        emailSubject: `Your Performance Report is ready — ${projectId.slice(0, 8)}`,
        emailHtml: renderPbdrDeliveryEmail({
          recipientName,
          projectId: projectId.slice(0, 8),
          downloadUrl,
          expiresAt,
        }),
      }).catch((err) => {
        console.error("[deliver-pbdr] submitter notify failed:", err);
      });
    }

    // Also deliver to delivery_recipient_email if set and different from submitter
    const recipientEmail = project.delivery_recipient_email as string | null;
    if (recipientEmail && downloadUrl) {
      const submitterEmail = (submitter?.email as string | null)?.toLowerCase();
      if (recipientEmail.toLowerCase() !== submitterEmail) {
        await sendEmail({
          to: recipientEmail,
          subject: `Your Performance Report is ready — ${projectId.slice(0, 8)}`,
          html: renderPbdrDeliveryEmail({
            recipientName: recipientEmail,
            projectId: projectId.slice(0, 8),
            downloadUrl,
            expiresAt,
          }),
          source: "document_delivery_recipient",
          projectId,
        }).catch((err) => {
          console.error("[deliver-pbdr] delivery_recipient email failed:", err);
        });
      }
    }

    const conversionEnd = new Date();

    await supabase
      .from("projects")
      .update({
        status: "delivered",
        delivered_at: conversionEnd.toISOString(),
        updated_at: conversionEnd.toISOString(),
      })
      .eq("id", projectId);

    await auditLog("project.delivered", actorId, actorEmail, {
      projectId,
      orgId: project.client_id as string,
      metadata: { project_number: (project.project_number as string | null) ?? null },
    });

    await auditLog("pbdr.delivered", actorId, actorEmail, {
      projectId,
      orgId: project.client_id as string,
      metadata: {
        pbdb_version: pbdbFile.version,
        pbdr_version: revisionIndex + 1,
        pbdr_filename: pbdrFilename,
        conversion_start: conversionStart.toISOString(),
        conversion_end: conversionEnd.toISOString(),
        triggered_by: actorId ? "manual" : "auto",
        outcome: "success",
      },
    });

    // Notify super admins and assigned consultant to close the project in the legacy database
    const projectRef = (project.project_number as string | null) ?? projectId.slice(0, 8);
    const completionMessage = `PBDR delivered for project ${projectRef}. Close the project record in the legacy database.`;
    const completionHtml = renderEmailShell({
      status: "success",
      statusLabel: "Delivered",
      heading: "PBDR delivered — close the legacy record",
      bodyHtml: paragraph(
        `The PBDR for project ${strong(projectRef)} has been converted and delivered to the client. Please close the corresponding project record in the legacy database.`,
        20
      ),
    });

    const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
    const consultantId = project.assigned_consultant_id as string | null;

    const recipientIds: string[] = [
      ...(admins ?? []).map((a) => a.id as string),
      ...(consultantId ? [consultantId] : []),
    ];

    await Promise.all(
      recipientIds.map((id) =>
        notify({
          recipientId: id,
          type: "pbdr_delivery",
          message: completionMessage,
          projectId,
          emailSubject: `PBDR delivered — close legacy record for ${projectRef}`,
          emailHtml: completionHtml,
        }).catch((err) => {
          console.error(`[deliver-pbdr] completion notify failed for ${id}:`, err);
        })
      )
    );

    console.log(`[deliver-pbdr] project ${projectId} delivered (${actorId ? "manual" : "auto"})`);
    return { success: true };
  } catch (err) {
    if (pdfStoragePath) {
      await supabase.storage.from("documents").remove([pdfStoragePath]).catch(() => {});
    }

    await supabase
      .from("projects")
      .update({ status: "dispatched", updated_at: new Date().toISOString() })
      .eq("id", projectId);

    await auditLog("pbdr.conversion_failed", actorId, actorEmail, {
      projectId,
      orgId: project.client_id as string,
      metadata: {
        error: err instanceof Error ? err.message : String(err),
        pbdb_version: pbdbVersion,
        pbdr_version: pbdrVersion,
        conversion_start: conversionStart.toISOString(),
        conversion_end: new Date().toISOString(),
        triggered_by: actorId ? "manual" : "auto",
        outcome: "failure",
      },
    });

    const errorMsg = err instanceof Error ? err.message : "Unknown error";
    const html = renderEmailShell({
      status: "error",
      statusLabel: "Failed",
      heading: "PBDR conversion failed",
      bodyHtml:
        paragraph(`Conversion failed for project ${strong(projectId.slice(0, 8))}.`) +
        noticeBox(e(errorMsg), "error") +
        paragraph("The project status has been reset to dispatched.", 20),
    });
    const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
    await Promise.all(
      (admins ?? []).map((u: { id: string }) =>
        notify({
          recipientId: u.id,
          type: "system_error",
          message: `PBDR conversion failed for ${projectId.slice(0, 8)}: ${errorMsg}`,
          projectId,
          emailSubject: `PBDR conversion failed — ${projectId.slice(0, 8)}`,
          emailHtml: html,
        }).catch(() => {})
      )
    );

    console.error("[deliver-pbdr] failed:", err);
    return { success: false, reason: errorMsg };
  }
}
