import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { sendEmail } from "@/lib/email/sender";
import { buildInboundReplyTo } from "@/lib/email/parser";
import { resolveStakeholders } from "@/lib/stakeholders/resolver";
import { notify } from "@/lib/notifications/notify";
import { extractDocumentFields } from "@/lib/documents/extractor";
import { normalizeExtractedFields } from "@/lib/documents/formatters";
import {
  getMetricsAutofillConfigs,
  getAutofillExclusionTokens,
  resolveMetricsAutofill,
} from "@/lib/documents/metrics-autofill";
import { buildFieldFlagPlan } from "@/lib/documents/field-flags";
import type { ComparisonMode } from "@/lib/documents/compare-candidates";

// #100: the real per-category pipelines, extracted out of the old webhook
// handlers (see #98's since-removed lib/email/inbound-handlers.ts) into a
// shape that runs against a *resolved* category/target chosen by an
// admin/consultant, instead of a live webhook payload. Both "Approve as
// proposed" and "Reassign & approve" in the resolution UI call
// executeQueueRowResolution — the only difference is which target they pass.

export interface QueueAttachmentRef {
  path: string;
  filename: string;
  content_type: string;
}

export interface QueueRowForExecution {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  message_id: string | null;
  mailbox_hash: string | null;
  text_body: string | null;
  stripped_reply_text: string | null;
  received_at: string;
  attachment_paths: QueueAttachmentRef[];
}

export type ResolvedTarget =
  | { category: "new_submission" }
  | { category: "thread_reply"; projectId: string }
  | { category: "stakeholder_response"; stakeholderReviewId: string };

export interface ExecutionResult {
  ok: boolean;
  error?: string;
  projectId?: string;
}

interface DownloadedAttachment {
  path: string;
  Name: string;
  ContentType: string;
  buffer: Buffer;
}

async function downloadPendingAttachments(
  row: QueueRowForExecution,
  supabase: ReturnType<typeof createAdminClient>
): Promise<DownloadedAttachment[]> {
  const results: DownloadedAttachment[] = [];
  for (const att of row.attachment_paths) {
    const { data, error } = await supabase.storage.from("pending-inbound").download(att.path);
    if (error || !data) {
      console.error(`[email-queue] Failed to download pending attachment ${att.path}:`, error);
      continue;
    }
    results.push({
      path: att.path,
      Name: att.filename,
      ContentType: att.content_type,
      buffer: Buffer.from(await data.arrayBuffer()),
    });
  }
  return results;
}

// Only removes paths the caller confirms were successfully copied to their
// final destination — an attachment whose final upload failed stays in
// pending-inbound rather than being lost outright (the #102 retention job
// purges it eventually).
async function removePendingAttachments(paths: string[], supabase: ReturnType<typeof createAdminClient>) {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from("pending-inbound").remove(paths);
  if (error) console.error("[email-queue] Failed to clean up pending attachments:", error);
}

// Stores the raw inbound email as an .eml evidence file, so the original
// correspondence stays on record even after its attachments are pulled out
// and filed as project documents. Shared by the new-submission and
// stakeholder-reply paths so both leave a correspondence trail.
async function archiveInboundEmailAsEvidence(
  row: QueueRowForExecution,
  fromEmail: string,
  clientId: string,
  projectId: string,
  uploadedBy: string,
  reference: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const fullBody = (row.text_body || "").trim();
  const evidenceBody = [
    `From: ${row.from_name ? `${row.from_name} <${fromEmail}>` : fromEmail}`,
    `Date: ${row.received_at}`,
    `Subject: ${row.subject ?? ""}`,
    `Message-ID: ${row.message_id ?? ""}`,
    "",
    fullBody || "(empty message body)",
  ].join("\n");

  // .eml + message/rfc822, not .txt — the evidence bucket's allowed_mime_types
  // (migration 00000000000076) doesn't include text/plain.
  const evidenceFilename = `email-${Date.now()}.eml`;
  const evidenceStoragePath = `${clientId}/${projectId}/evidence/${evidenceFilename}`;

  const { error: uploadError } = await supabase.storage
    .from("evidence")
    .upload(evidenceStoragePath, Buffer.from(evidenceBody, "utf8"), {
      contentType: "message/rfc822",
      upsert: false,
    });

  if (uploadError) {
    console.error("[email-queue] Failed to store email as evidence:", uploadError);
    return null;
  }

  const { data: inserted } = await supabase
    .from("project_files")
    .insert({
      project_id: projectId,
      file_type: "evidence",
      storage_path: evidenceStoragePath,
      original_filename: evidenceFilename,
      uploaded_by: uploadedBy,
      reference,
    })
    .select("id")
    .single();

  return (inserted?.id as string | null) ?? null;
}

async function executeNewSubmission(
  row: QueueRowForExecution,
  supabase: ReturnType<typeof createAdminClient>
): Promise<ExecutionResult> {
  const { data: user } = await supabase
    .from("users")
    .select("id, email, client_id, role")
    .eq("email", row.from_email)
    .maybeSingle();

  if (!user || !user.client_id || user.role !== "stakeholder") {
    return { ok: false, error: "Sender is not a recognised client user — cannot create a new submission for this address." };
  }

  const { data: org } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", user.client_id as string)
    .maybeSingle();

  if (!org) {
    return { ok: false, error: "Sender's organisation could not be found." };
  }

  const { data: templates } = await supabase
    .from("templates")
    .select("id")
    .eq("client_id", org.id as string)
    .eq("status", "active")
    .limit(1);
  const templateId = templates?.[0]?.id ?? null;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      client_id: org.id,
      template_id: templateId,
      submitted_by: user.id,
      status: "draft",
      source: "email",
    })
    .select("id")
    .single();

  if (projectError || !project) {
    console.error("[email-queue] Failed to create draft project:", projectError);
    return { ok: false, error: "Failed to create the draft project." };
  }

  const projectId = project.id as string;

  await archiveInboundEmailAsEvidence(
    row,
    user.email as string,
    org.id as string,
    projectId,
    user.id as string,
    "email_submission",
    supabase
  );

  // Same "reply arrived with no thread reference" verify-me flag as the
  // original webhook handler (#98's handleNewSubmission) — the email had no
  // MailboxHash at intake even though it looked like a reply, so still worth
  // surfacing regardless of how long it sat in the queue.
  if (!row.mailbox_hash && row.stripped_reply_text) {
    await auditLog("email.reply_without_mailbox_hash", user.id as string, user.email as string, {
      orgId: org.id as string,
      projectId,
      metadata: { message_id: row.message_id, queue_id: row.id },
    });
    const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
    await Promise.all(
      (admins ?? []).map((a) =>
        notify({
          recipientId: a.id as string,
          type: "email_reply_without_thread_token",
          message: `${user.email} sent an email that looks like a reply, but it arrived with no thread reference — it was processed as a new report request instead of added to an existing thread. Please verify.`,
          projectId,
          emailSubject: "OPS: Possible misrouted email reply — please verify",
          emailHtml: `<p>An email from <strong>${user.email}</strong> looks like a reply (Postmark detected reply-style content), but it had no thread reference, so it was processed as a brand-new report request rather than threaded onto an existing draft.</p><p>Please check whether <a href="${appUrl}/admin/projects/${projectId}">this project</a> is correct, or whether its attachments actually belong on an existing thread.</p>`,
        }).catch(() => {})
      )
    );
  }

  const files = await downloadPendingAttachments(row, supabase);
  const uploadedPendingPaths: string[] = [];
  const pdfBuffers: Buffer[] = [];

  for (let i = 0; i < files.length; i++) {
    const attachment = files[i];
    const storagePath = `${org.id}/${projectId}/${attachment.Name}`;
    const fileType = i === 0 && attachment.ContentType === "application/pdf" ? "purchase_order" : "building_drawing_plans";

    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(storagePath, attachment.buffer, {
        contentType: attachment.ContentType,
        upsert: false,
      });

    if (uploadError) {
      console.error(`[email-queue] Storage upload failed for ${attachment.Name}:`, uploadError);
      continue;
    }
    uploadedPendingPaths.push(attachment.path);

    await supabase.from("project_files").insert({
      project_id: projectId,
      file_type: fileType,
      storage_path: storagePath,
      original_filename: attachment.Name,
      uploaded_by: user.id,
    });

    if (attachment.ContentType === "application/pdf") {
      pdfBuffers.push(attachment.buffer);
    }
  }

  // Run field extraction if we have PDF files
  if (pdfBuffers.length > 0) {
    try {
      let extractTokens: { token: string; label: string; hint: string }[] = [];
      const metricsAutofillConfigs = await getMetricsAutofillConfigs(supabase, org.id as string);
      const metricsExclusionTokens = getAutofillExclusionTokens(metricsAutofillConfigs);
      let comparisonModeByToken = new Map<string, ComparisonMode>();
      if (templateId) {
        const { data: mappings } = await supabase
          .from("template_field_mappings")
          .select("placeholder_token, display_label, extraction_hint, comparison_mode")
          .eq("template_id", templateId)
          .eq("field_key", "extract")
          .order("sort_order")
          .order("placeholder_token");
        extractTokens = (mappings ?? [])
          .filter((m) => !metricsExclusionTokens.has(m.placeholder_token as string))
          .map((m) => ({
            token: m.placeholder_token as string,
            label: (m.display_label as string | null) ?? (m.placeholder_token as string),
            hint: (m.extraction_hint as string | null) ?? "",
          }));
        comparisonModeByToken = new Map(
          (mappings ?? []).map((m) => [
            m.placeholder_token as string,
            (m.comparison_mode as ComparisonMode | null) ?? "exact",
          ])
        );
      }

      const extracted = await extractDocumentFields(
        pdfBuffers.map((buf, i) => ({ label: `Attachment ${i + 1}`, buffer: buf })),
        extractTokens
      );

      resolveMetricsAutofill(metricsAutofillConfigs, extracted.fields);

      const fieldValues = normalizeExtractedFields(
        Object.fromEntries(Object.entries(extracted.fields).map(([k, v]) => [k, v.value]))
      );

      const flagRows: {
        project_id: string;
        type: string;
        field_key: string;
        status: string;
        current_value: string;
        candidate_values: unknown;
      }[] = [];
      for (const [token, rawCandidates] of Object.entries(extracted.candidates)) {
        const normalizedCandidates = rawCandidates.map((c) => ({
          ...c,
          value: normalizeExtractedFields({ [token]: c.value })[token],
        }));
        const plan = await buildFieldFlagPlan(normalizedCandidates, comparisonModeByToken.get(token) ?? "exact");
        if (!plan.needsFlag) continue;
        flagRows.push({
          project_id: projectId,
          type: plan.flagType,
          field_key: token,
          status: "open",
          current_value: fieldValues[token] ?? plan.finalValue,
          candidate_values: plan.candidateRecords,
        });
      }

      const siteAddress = (fieldValues["EXTRACT_ADDRESS"] ?? "").trim() || null;

      if (siteAddress) {
        const { data: dupe } = await supabase
          .from("projects")
          .select("id")
          .eq("client_id", org.id)
          .eq("site_address", siteAddress)
          .is("deleted_at", null)
          .neq("id", projectId)
          .maybeSingle();

        if (dupe) {
          await sendEmail({
            to: user.email as string,
            subject: "OPS: Duplicate address detected",
            html: duplicateAddressHtml(siteAddress, dupe.id as string),
            source: "email_queue_duplicate_address",
            projectId,
          });
          await auditLog("email.duplicate_address", user.id as string, user.email as string, {
            orgId: org.id as string,
            projectId,
            metadata: { site_address: siteAddress, existing_project_id: dupe.id, queue_id: row.id },
          });
          await supabase
            .from("projects")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", projectId);
          await removePendingAttachments(uploadedPendingPaths, supabase);
          return { ok: true, projectId };
        }
      }

      if (flagRows.length > 0) {
        await supabase.from("field_flags").insert(flagRows);
      }

      await supabase
        .from("projects")
        .update({
          extracted_fields: fieldValues,
          ...(extracted.po_number.value ? { po_number: extracted.po_number.value } : {}),
          ...(siteAddress ? { site_address: siteAddress } : {}),
        })
        .eq("id", projectId);
    } catch (err) {
      console.error("[email-queue] Extraction failed (non-fatal):", err);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const portalLink = `${appUrl}/portal/submit/resume/${projectId}`;
  const replyTo = buildInboundReplyTo(projectId);

  const draftEmailSent = await sendEmail({
    to: user.email as string,
    subject: "OPS: Your report request draft is ready",
    html: portalLinkHtml(org.name as string, portalLink),
    source: "email_queue_draft_created",
    projectId,
    ...(replyTo ? { replyTo } : {}),
  });

  await auditLog("email.draft_created", user.id as string, user.email as string, {
    orgId: org.id as string,
    projectId,
    metadata: {
      message_id: row.message_id,
      queue_id: row.id,
      attachments: files.map((f) => f.Name),
      draft_email_sent: draftEmailSent,
    },
  });

  if (!draftEmailSent) {
    try {
      await auditLog("email.draft_notification_failed", user.id as string, user.email as string, {
        orgId: org.id as string,
        projectId,
        metadata: { message_id: row.message_id, queue_id: row.id },
      });
      const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
      await Promise.all(
        (admins ?? []).map((a) =>
          notify({
            recipientId: a.id as string,
            type: "email_draft_notification_failed",
            message: `A draft was created from ${user.email}'s emailed report request, but the "your draft is ready" notification failed to send — they haven't been told it exists yet.`,
            projectId,
            emailSubject: "OPS: Stakeholder was not notified of their email-created draft",
            emailHtml: `<p>A draft project was created from an email sent by <strong>${user.email}</strong>, but the notification telling them to confirm it failed to send (check the Email delivery log for details).</p><p>They don't know the draft exists yet. Consider following up manually or resending from <a href="${appUrl}/admin/projects/${projectId}">the project page</a>.</p>`,
          }).catch(() => {})
        )
      );
    } catch (err) {
      console.error("[email-queue] Failed to raise draft-notification-failed alert (non-fatal):", err);
    }
  }

  await removePendingAttachments(uploadedPendingPaths, supabase);

  return { ok: true, projectId };
}

async function executeThreadReply(
  row: QueueRowForExecution,
  projectId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<ExecutionResult> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, status, template_id, submitted_by")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project || project.status !== "draft") {
    return { ok: false, error: "Target project was not found, or is no longer a draft." };
  }

  const files = await downloadPendingAttachments(row, supabase);
  if (files.length === 0) {
    // Matches the original handler's silent no-op when the email carried no
    // supported attachments — nothing to thread onto the draft.
    return { ok: true, projectId };
  }

  const uploadedPendingPaths: string[] = [];
  const pdfBuffers: Buffer[] = [];

  for (const attachment of files) {
    const storagePath = `${project.client_id}/${projectId}/${attachment.Name}`;

    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(storagePath, attachment.buffer, {
        contentType: attachment.ContentType,
        upsert: true,
      });

    if (uploadError) {
      console.error(`[email-queue] Thread upload failed for ${attachment.Name}:`, uploadError);
      continue;
    }
    uploadedPendingPaths.push(attachment.path);

    const { data: existing } = await supabase
      .from("project_files")
      .select("id")
      .eq("project_id", projectId)
      .eq("storage_path", storagePath)
      .maybeSingle();

    if (!existing) {
      await supabase.from("project_files").insert({
        project_id: projectId,
        file_type: "building_drawing_plans",
        storage_path: storagePath,
        original_filename: attachment.Name,
        uploaded_by: project.submitted_by,
      });
    }

    if (attachment.ContentType === "application/pdf") {
      pdfBuffers.push(attachment.buffer);
    }
  }

  if (pdfBuffers.length > 0) {
    try {
      const threadTemplateId = (project.template_id as string | null) ?? null;
      let extractTokens: { token: string; label: string; hint: string }[] = [];
      if (threadTemplateId) {
        const { data: mappings } = await supabase
          .from("template_field_mappings")
          .select("placeholder_token, display_label, extraction_hint")
          .eq("template_id", threadTemplateId)
          .eq("field_key", "extract");
        extractTokens = (mappings ?? []).map((m) => ({
          token: m.placeholder_token as string,
          label: (m.display_label as string | null) ?? (m.placeholder_token as string),
          hint: (m.extraction_hint as string | null) ?? "",
        }));
      }

      const extracted = await extractDocumentFields(
        pdfBuffers.map((buf, i) => ({ label: `Attachment ${i + 1}`, buffer: buf })),
        extractTokens
      );

      const { data: current } = await supabase
        .from("projects")
        .select("extracted_fields, po_number")
        .eq("id", projectId)
        .single();

      const newFieldValues = normalizeExtractedFields(
        Object.fromEntries(Object.entries(extracted.fields).map(([k, v]) => [k, v.value]))
      );
      const merged = { ...(current?.extracted_fields as Record<string, string> ?? {}), ...newFieldValues };

      await supabase
        .from("projects")
        .update({
          extracted_fields: merged,
          ...(extracted.po_number.value && !current?.po_number
            ? { po_number: extracted.po_number.value }
            : {}),
        })
        .eq("id", projectId);
    } catch (err) {
      console.error("[email-queue] Thread extraction failed (non-fatal):", err);
    }
  }

  await auditLog("email.thread_attachments_added", project.submitted_by as string, row.from_email, {
    projectId,
    metadata: { message_id: row.message_id, queue_id: row.id, attachments: files.map((f) => f.Name) },
  });

  await removePendingAttachments(uploadedPendingPaths, supabase);

  return { ok: true, projectId };
}

// A reply to a stakeholder's approval-request email (#68). The token proves the
// sender received this specific email; it does not prove they *are* the
// stakeholder (a forward or a shared inbox could reply too), so we separately
// check the sender against the project/client stakeholder roster and record
// whether it matched. No approve/reject interpretation happens here — the
// consultant resolves it manually via the #65 form. Sender-verification is
// always computed fresh, against whatever the final target is (#100) — never
// carried over from intake.
async function executeStakeholderResponse(
  row: QueueRowForExecution,
  reviewId: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<ExecutionResult> {
  const { data: review } = await supabase
    .from("stakeholder_reviews")
    .select("id, project_id, stakeholder_email, stakeholder_name")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) {
    return { ok: false, error: "Target review cycle was not found." };
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, submitted_by, assigned_consultant_id, qa_completed_by, extracted_fields, project_number")
    .eq("id", review.project_id as string)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) {
    await auditLog("email.stakeholder_reply_invalid", null, row.from_email, {
      metadata: { review_id: review.id, message_id: row.message_id, queue_id: row.id, reason: "project not found" },
    });
    return { ok: false, error: "The review's project could not be found." };
  }

  const knownEmails = new Set<string>([(review.stakeholder_email as string).toLowerCase()]);
  const roster = await resolveStakeholders(project.id as string, project.client_id as string);
  for (const s of roster) knownEmails.add(s.email.toLowerCase());
  if (project.submitted_by) {
    const { data: submitter } = await supabase
      .from("users")
      .select("email")
      .eq("id", project.submitted_by as string)
      .maybeSingle();
    if (submitter?.email) knownEmails.add((submitter.email as string).toLowerCase());
  }
  const verified = knownEmails.has(row.from_email.toLowerCase());

  const replyText = (row.stripped_reply_text || row.text_body || "").trim();
  const receivedAt = new Date().toISOString();

  await supabase
    .from("stakeholder_reviews")
    .update({
      email_reply_text: replyText,
      email_reply_received_at: receivedAt,
      email_reply_sender_verified: verified,
    })
    .eq("id", review.id);

  const uploadedBy = (project.assigned_consultant_id as string | null) ?? (project.submitted_by as string);
  const evidenceFileId = await archiveInboundEmailAsEvidence(
    row,
    row.from_email,
    project.client_id as string,
    project.id as string,
    uploadedBy,
    `stakeholder_review:${review.id}`,
    supabase
  );

  await auditLog("stakeholder.email_reply_received", null, row.from_email, {
    projectId: project.id as string,
    orgId: project.client_id as string,
    metadata: {
      review_id: review.id,
      message_id: row.message_id,
      queue_id: row.id,
      sender_verified: verified,
      evidence_file_id: evidenceFileId,
    },
  });

  const projectRef =
    (project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ??
    (project.project_number as string | null) ??
    (project.id as string).slice(0, 8);

  const recipientIds = new Set<string>();
  const consultantId =
    (project.qa_completed_by as string | null) ?? (project.assigned_consultant_id as string | null);
  if (consultantId) recipientIds.add(consultantId);
  const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
  for (const a of admins ?? []) recipientIds.add(a.id as string);

  const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ops/projects/${project.id}`;
  const snippet = replyText.slice(0, 120) + (replyText.length > 120 ? "…" : "");
  const verifiedNote = verified ? "" : " — sender could not be verified against the stakeholder list";

  await Promise.all(
    [...recipientIds].map((recipientId) =>
      notify({
        recipientId,
        type: "stakeholder_replied_by_email",
        message: `${review.stakeholder_name} replied by email on ${projectRef}${verifiedNote} — needs manual resolution.${snippet ? ` "${snippet}"` : ""}`,
        projectId: project.id as string,
        emailSubject: `Stakeholder replied by email — needs action (ref: ${(project.id as string).slice(0, 8)})`,
        emailHtml: `<p style="font-family:sans-serif">${review.stakeholder_name} (${review.stakeholder_email}) replied by email to their approval request for <strong>${projectRef}</strong>${verifiedNote}.</p><p style="font-family:sans-serif">Their reply is not auto-interpreted — please review it and log the response manually.</p><p style="font-family:sans-serif"><a href="${projectUrl}">Open the project</a></p>`,
      }).catch(() => {})
    )
  );

  return { ok: true, projectId: project.id as string };
}

export async function executeQueueRowResolution(
  row: QueueRowForExecution,
  target: ResolvedTarget,
  supabase: ReturnType<typeof createAdminClient>
): Promise<ExecutionResult> {
  switch (target.category) {
    case "new_submission":
      return executeNewSubmission(row, supabase);
    case "thread_reply":
      return executeThreadReply(row, target.projectId, supabase);
    case "stakeholder_response":
      return executeStakeholderResponse(row, target.stakeholderReviewId, supabase);
  }
}

function portalLinkHtml(orgName: string, portalLink: string): string {
  return `<p>Hi,</p>
<p>We've received your documents for <strong>${orgName}</strong> and pre-filled a draft report request with the extracted information.</p>
<p>Please <a href="${portalLink}">click here to review and confirm your draft</a> before it is processed. You may need to log in first.</p>
<p>If any fields look incorrect, you can edit them in the portal before submitting.</p>
<p>If you have additional documents to attach, simply reply to this email with them included.</p>
<p>Regards,<br>OPS Team</p>`;
}

function duplicateAddressHtml(siteAddress: string, existingProjectId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `<p>Hi,</p>
<p>We received your email but detected a duplicate address: <strong>${siteAddress}</strong>.</p>
<p>An active project for this address already exists. Please <a href="${appUrl}/portal/projects/${existingProjectId}">view the existing project</a> or contact your OPS account manager if you believe this is incorrect.</p>
<p>Regards,<br>OPS Team</p>`;
}
