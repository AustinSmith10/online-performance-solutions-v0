import { createAdminClient } from "@/lib/supabase/admin";
import { checkPbdrGate } from "@/lib/payments/gate";
import { convertPbdbToPbdr } from "@/lib/documents/converter";
import { setRevisionHistoryRows, setCoverRevisionNumber } from "@/lib/documents/revision-table";
import { stripRedTokenColor } from "@/lib/documents/color-strip";
import { convertDocxToPdf } from "@/lib/documents/pdf";
import { buildPbdrFilename } from "@/lib/documents/naming";
import {
  peekNextRevNumber,
  recordRevisionEvent,
  getRevisionHistory,
  formatRevisionHistoryRows,
} from "@/lib/documents/revision-history";
import { formatAddress } from "@/lib/documents/formatters";
import { auditLog } from "@/lib/audit/log";
import { notify } from "@/lib/notifications/notify";
import { deliverPbdrEmails } from "@/lib/documents/pbdr-delivery-email";
import { renderEmailShell, e, paragraph, strong, noticeBox } from "@/lib/email/templates/shell";
import { computeSignedUrlExpirySeconds } from "@/lib/stakeholders/tokens";
import { writeProgress, PROGRESS_MILESTONES } from "@/lib/documents/progress";

export interface DeliverPbdrResult {
  success: boolean;
  reason?: string;
}

/**
 * Core PBDB→PBDR conversion and delivery pipeline.
 *
 * Called from:
 *   - triggerPbdrConversion server action (admin/consultant Convert button),
 *     via scheduleOrDeliverPbdr once the effective delivery time has arrived
 *   - The worker's release-pending-deliveries cron sweep, for conversions
 *     staged behind a delivery-delay preset
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
    .select("id, client_id, status, project_number, extracted_fields, delivery_recipient_email, submitted_by, assigned_consultant_id, review_cycle, strip_token_color, clients(state_territory)")
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();

  if (projErr || !project) return { success: false, reason: "Project not found." };
  if ((project.status as string) !== "dispatched") {
    return { success: false, reason: `Project is in ${project.status} status, expected dispatched.` };
  }

  // Human-readable reference for all user-facing text below — falls back to
  // the project ID's first 8 chars only when no project number is assigned yet.
  const projectRef = (project.project_number as string | null) ?? projectId.slice(0, 8);

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
          `Conversion could not start for project ${strong(projectRef)}.`
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
          emailSubject: `PBDR conversion blocked — ${projectRef}`,
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

  await writeProgress(supabase, projectId, PROGRESS_MILESTONES[0]); // 20

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

    // R[n] on the PBDR derives from revision_history's independent PBDR counter
    // (#108/#109) — peeked here (not yet recorded) so the filename (and the
    // table rebuild below) can use it before the conversion has actually
    // succeeded; recorded for real just below once the file is safely stored.
    const revisionIndex = await peekNextRevNumber(supabase, projectId, "pbdr");
    pbdrVersion = revisionIndex + 1;

    // The table convertPbdbToPbdr() carried over is still the PBDB's own
    // rows (just with "Stakeholder Review" text-swapped to "For
    // Construction") — those aren't real PBDR revisions. Rebuild the table
    // from the project's actual PBDR-only history, plus this about-to-be-
    // recorded row (not yet in the DB, so it's appended manually — mirrors
    // the peek-then-record pattern above). Must happen before the PDF
    // render below, since a PDF can't be edited afterwards.
    const existingPbdrHistory = (await getRevisionHistory(supabase, projectId)).filter(
      (row) => row.doc_type === "pbdr"
    );
    const pbdrHistoryForDoc = await formatRevisionHistoryRows(supabase, [
      ...existingPbdrHistory,
      {
        doc_type: "pbdr",
        rev_number: revisionIndex,
        prepared_by: (project.assigned_consultant_id as string | null) ?? null,
        event: "approved_conversion",
        created_at: conversionStart.toISOString(),
      },
    ]);
    transformedDocx = setRevisionHistoryRows(
      transformedDocx,
      pbdrHistoryForDoc.map((row) => ({
        docType: row.DOC_TYPE,
        revNumber: row.REV_NUMBER,
        date: row.DATE,
        purpose: row.EVENT,
        preparedBy: row.PREPARED_BY,
      }))
    );

    // Same for the cover page's scalar Revision value — it still shows
    // whatever the source PBDB's own cover said (its own PBDB rev number),
    // not the PBDR's independent counter. Patch it to the PBDR's own rev.
    transformedDocx = setCoverRevisionNumber(transformedDocx, String(revisionIndex));

    // Strip red token colour if enabled (default on)
    if (project.strip_token_color as boolean) {
      transformedDocx = stripRedTokenColor(transformedDocx);
    }

    await writeProgress(supabase, projectId, PROGRESS_MILESTONES[1]); // 40

    // Generate PDF via Gotenberg (60 s hard timeout enforced inside)
    const pdfBuffer = await convertDocxToPdf(transformedDocx);

    await writeProgress(supabase, projectId, PROGRESS_MILESTONES[2]); // 70

    // Build PBDR filename
    const rawAddress =
      (project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ?? "";
    const address = formatAddress(rawAddress);

    const pbdrFilename = buildPbdrFilename(
      projectRef,
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

    // The PBDR file is safely stored — commit the revision_history row now.
    // prepared_by snapshots the assigned consultant even when an admin
    // manually triggered this as a failsafe (see revision-history.ts).
    await recordRevisionEvent(supabase, projectId, "pbdr", "approved_conversion");

    await writeProgress(supabase, projectId, PROGRESS_MILESTONES[3]); // 90

    // Signed URL valid for 14 business days (#161) — embedded in delivery emails
    const deliveryStateTerritory =
      (project.clients as unknown as { state_territory: string | null } | null)?.state_territory ??
      null;
    const signedUrlExpirySeconds = await computeSignedUrlExpirySeconds(
      new Date(),
      deliveryStateTerritory
    );
    const { data: signed } = await supabase.storage
      .from("documents")
      .createSignedUrl(pdfStoragePath, signedUrlExpirySeconds);
    const downloadUrl = signed?.signedUrl ?? null;
    const expiresAt = new Date(
      Date.now() + signedUrlExpirySeconds * 1000
    ).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    if (downloadUrl) {
      await deliverPbdrEmails({
        supabase,
        projectId,
        templateProjectRef: projectRef,
        submittedBy: project.submitted_by as string | null,
        deliveryRecipientEmail: project.delivery_recipient_email as string | null,
        downloadUrl,
        expiresAt,
        subject: `Your Performance Report is ready — ${projectRef}`,
        notifyTitle: "Report delivered",
        notifyMessage: `Your PBDR for project ${projectRef} has been delivered.`,
        recipientEmailSource: "document_delivery_recipient",
        logPrefix: "[deliver-pbdr]",
      });
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

    await writeProgress(supabase, projectId, PROGRESS_MILESTONES[4]); // 100

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
          title: "PBDR delivered",
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

    await writeProgress(supabase, projectId, null);

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
        paragraph(`Conversion failed for project ${strong(projectRef)}.`) +
        noticeBox(e(errorMsg), "error") +
        paragraph("The project status has been reset to dispatched.", 20),
    });
    const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
    await Promise.all(
      (admins ?? []).map((u: { id: string }) =>
        notify({
          recipientId: u.id,
          type: "system_error",
          title: "Conversion failed",
          message: `PBDR conversion failed for ${projectRef}: ${errorMsg}`,
          projectId,
          emailSubject: `PBDR conversion failed — ${projectRef}`,
          emailHtml: html,
        }).catch(() => {})
      )
    );

    console.error("[deliver-pbdr] failed:", err);
    return { success: false, reason: errorMsg };
  }
}
