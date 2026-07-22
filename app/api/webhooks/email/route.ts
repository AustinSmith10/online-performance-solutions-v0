import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { sendEmail } from "@/lib/email/sender";
import {
  parseInboundPayload,
  senderEmail,
  isSupportedAttachment,
  attachmentBuffer,
  buildInboundReplyTo,
  type PostmarkAttachment,
} from "@/lib/email/parser";
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

// Postmark retries on non-2xx — always return 200 so it doesn't retry on expected failures.
// This does not apply to auth failures below: Postmark won't retry with different
// credentials, so a 401 there is safe and won't trigger a retry storm.

function isAuthorized(req: NextRequest): boolean {
  const user = process.env.POSTMARK_INBOUND_WEBHOOK_USER;
  const password = process.env.POSTMARK_INBOUND_WEBHOOK_PASSWORD;
  if (!user || !password) {
    console.warn("[email-webhook] POSTMARK_INBOUND_WEBHOOK_* not set — skipping auth check (dev only)");
    return true;
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    return false;
  }

  let decoded: string;
  try {
    decoded = Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return false;
  }

  return decoded === `${user}:${password}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payload = parseInboundPayload(body);
  if (!payload) {
    console.error("[email-webhook] Could not parse Postmark payload");
    return NextResponse.json({ ok: true });
  }

  const fromEmail = senderEmail(payload);
  const supabase = createAdminClient();

  // ── 0. Stakeholder-reply threading (#68) ────────────────────────────────────
  // Checked before the sender-lookup gate below: third-party stakeholders who
  // reply to their approval email typically have no `users` row at all (they're
  // in the `stakeholders` table, not portal accounts), so the ordinary
  // sender-lookup gate would otherwise bounce every one of these replies as an
  // "unrecognised sender". The token itself is the credential here.
  if (payload.MailboxHash) {
    const { data: review } = await supabase
      .from("stakeholder_reviews")
      .select("*")
      .eq("token", payload.MailboxHash)
      .maybeSingle();

    if (review) {
      await handleStakeholderEmailReply(payload, review, fromEmail, supabase);
      return NextResponse.json({ ok: true });
    }
  }

  // ── 1. Look up sender ──────────────────────────────────────────────────────
  const { data: user } = await supabase
    .from("users")
    .select("id, email, client_id, role")
    .eq("email", fromEmail)
    .single();

  if (!user || !user.client_id) {
    await sendEmail({
      to: fromEmail,
      subject: "OPS: Unrecognised sender",
      html: unrecognisedSenderHtml(fromEmail),
      source: "webhook_unrecognised_sender",
    });
    await auditLog("email.unrecognised_sender", null, fromEmail, {
      metadata: { message_id: payload.MessageID },
    });
    return NextResponse.json({ ok: true });
  }

  // Only stakeholder users can submit via email
  if (user.role !== "stakeholder") {
    return NextResponse.json({ ok: true });
  }

  // ── 2. Email whitelist check ───────────────────────────────────────────────
  const { data: org } = await supabase
    .from("clients")
    .select("id, name, email_whitelist, abandoned_draft_days")
    .eq("id", user.client_id)
    .single();

  if (!org) {
    return NextResponse.json({ ok: true });
  }

  if (org.email_whitelist && org.email_whitelist.length > 0) {
    const senderDomain = fromEmail.split("@")[1] ?? "";
    const allowed = (org.email_whitelist as string[]).some(
      (domain) => senderDomain === domain || fromEmail === domain
    );
    if (!allowed) {
      await sendEmail({
        to: fromEmail,
        subject: "OPS: Email submission not permitted",
        html: whitelistBlockedHtml(fromEmail),
        source: "webhook_whitelist_blocked",
      });
      await auditLog("email.whitelist_blocked", user.id, user.email, {
        orgId: org.id,
        metadata: { message_id: payload.MessageID },
      });
      return NextResponse.json({ ok: true });
    }
  }

  // ── 3. Threading: MailboxHash links reply to an existing draft ─────────────
  if (payload.MailboxHash) {
    await handleThreadReply(payload, payload.MailboxHash, user, supabase);
    return NextResponse.json({ ok: true });
  }

  // ── 4. New submission ──────────────────────────────────────────────────────
  const supportedFiles = payload.Attachments.filter((a) =>
    isSupportedAttachment(a.ContentType)
  );

  if (supportedFiles.length === 0) {
    await sendEmail({
      to: fromEmail,
      subject: "OPS: Please submit via the portal",
      html: noAttachmentHtml(fromEmail, org.name as string),
      source: "webhook_no_attachments",
    });
    await auditLog("email.no_attachments", user.id, user.email, {
      orgId: org.id,
      metadata: { message_id: payload.MessageID },
    });
    return NextResponse.json({ ok: true });
  }

  await handleNewSubmission(payload, supportedFiles, user, org, supabase);
  return NextResponse.json({ ok: true });
}

// ── Handlers ──────────────────────────────────────────────────────────────────

// Stores the raw inbound email as an .eml evidence file, so the original
// correspondence stays on record even after its attachments are pulled out
// and filed as project documents. Shared by the new-submission and
// stakeholder-reply paths so both leave a correspondence trail.
async function archiveInboundEmailAsEvidence(
  payload: ReturnType<typeof parseInboundPayload> & object,
  fromEmail: string,
  clientId: string,
  projectId: string,
  uploadedBy: string,
  reference: string,
  supabase: ReturnType<typeof createAdminClient>
): Promise<string | null> {
  const fullBody = (payload.TextBody || "").trim();
  const evidenceBody = [
    `From: ${payload.FromName ? `${payload.FromName} <${fromEmail}>` : fromEmail}`,
    `Date: ${payload.Date}`,
    `Subject: ${payload.Subject}`,
    `Message-ID: ${payload.MessageID}`,
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
    console.error("[email-webhook] Failed to store email as evidence:", uploadError);
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

async function handleNewSubmission(
  payload: ReturnType<typeof parseInboundPayload> & object,
  files: PostmarkAttachment[],
  user: { id: string; email: string; client_id: string },
  org: { id: string; name: string },
  supabase: ReturnType<typeof createAdminClient>
) {
  // Resolve active template for the org
  const { data: templates } = await supabase
    .from("templates")
    .select("id")
    .eq("client_id", org.id)
    .eq("status", "active")
    .limit(1);

  const templateId = templates?.[0]?.id ?? null;

  // Create draft project
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
    console.error("[email-webhook] Failed to create draft project:", projectError);
    return;
  }

  const projectId = project.id;

  // Archive the raw email itself as evidence — once the attachments below are
  // pulled out and filed as project documents, this is the only remaining
  // record of the original correspondence that created the request.
  await archiveInboundEmailAsEvidence(
    payload,
    user.email,
    org.id,
    projectId,
    user.id,
    "email_submission",
    supabase
  );

  // Postmark's own reply-detection (StrippedTextReply is only populated when
  // it recognises quote/signature structure typical of a reply) firing on an
  // email that reached us with no MailboxHash is a signal this may actually
  // be a reply to an existing thread whose thread-reference got lost — e.g. a
  // mail client rewriting the reply-to plus-address back to the bare inbound
  // address. We still can't tell *which* thread it belongs to, so we process
  // it as a new submission as before, but flag it for a human to verify
  // rather than silently risk filing it as an unrelated new request.
  if (payload.StrippedTextReply) {
    await auditLog("email.reply_without_mailbox_hash", user.id, user.email, {
      orgId: org.id,
      projectId,
      metadata: { message_id: payload.MessageID },
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

  // Upload attachments to Supabase Storage and create project_files rows
  const pdfBuffers: Buffer[] = [];

  for (let i = 0; i < files.length; i++) {
    const attachment = files[i];
    const buffer = attachmentBuffer(attachment);
    const storagePath = `${org.id}/${projectId}/${attachment.Name}`;
    const fileType = i === 0 && attachment.ContentType === "application/pdf" ? "purchase_order" : "building_drawing_plans";

    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(storagePath, buffer, {
        contentType: attachment.ContentType,
        upsert: false,
      });

    if (uploadError) {
      console.error(`[email-webhook] Storage upload failed for ${attachment.Name}:`, uploadError);
      continue;
    }

    await supabase.from("project_files").insert({
      project_id: projectId,
      file_type: fileType,
      storage_path: storagePath,
      original_filename: attachment.Name,
      uploaded_by: user.id,
    });

    if (attachment.ContentType === "application/pdf") {
      pdfBuffers.push(buffer);
    }
  }

  // Run field extraction if we have PDF files
  if (pdfBuffers.length > 0) {
    try {
      // Load EXTRACT_ token mappings for the active template
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

      // Candidate comparison + flag decision per extract token (#58) — same
      // model as the portal submission flow in app/actions/submission.ts.
      const flagRows: {
        project_id: string;
        type: string;
        field_key: string;
        status: string;
        current_value: string;
        candidate_values: unknown;
      }[] = [];
      // Every extract token is checked, including ones with zero candidates —
      // a field extraction that found nothing anywhere must flag for review
      // too (extraction-verification-layer-decisions #7), not be skipped.
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

      // Check duplicate address
      if (siteAddress) {
        const { data: dupe } = await supabase
          .from("projects")
          .select("id")
          .eq("client_id", org.id)
          .eq("site_address", siteAddress)
          .is("deleted_at", null)
          .maybeSingle();

        if (dupe) {
          await sendEmail({
            to: user.email,
            subject: "OPS: Duplicate address detected",
            html: duplicateAddressHtml(user.email, siteAddress, dupe.id),
            source: "webhook_duplicate_address",
            projectId,
          });
          await auditLog("email.duplicate_address", user.id, user.email, {
            orgId: org.id,
            projectId: projectId,
            metadata: { site_address: siteAddress, existing_project_id: dupe.id },
          });
          // Soft-delete the just-created draft — it's a duplicate
          await supabase
            .from("projects")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", projectId);
          return;
        }
      }

      if (flagRows.length > 0) {
        await supabase.from("field_flags").insert(flagRows);
      }

      // Save extracted field values, PO number, and site address to the project
      await supabase
        .from("projects")
        .update({
          extracted_fields: fieldValues,
          ...(extracted.po_number.value ? { po_number: extracted.po_number.value } : {}),
          ...(siteAddress ? { site_address: siteAddress } : {}),
        })
        .eq("id", projectId);
    } catch (err) {
      console.error("[email-webhook] Extraction failed (non-fatal):", err);
    }
  }

  // Send portal link — go directly to step 2 so the client confirms their details
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const portalLink = `${appUrl}/portal/submit/resume/${projectId}`;
  const replyTo = buildInboundReplyTo(projectId);

  const draftEmailSent = await sendEmail({
    to: user.email,
    subject: "OPS: Your report request draft is ready",
    html: portalLinkHtml(user.email, org.name as string, portalLink),
    source: "webhook_draft_created",
    projectId,
    ...(replyTo ? { replyTo } : {}),
  });

  await auditLog("email.draft_created", user.id, user.email, {
    orgId: org.id,
    projectId,
    metadata: { message_id: payload.MessageID, attachments: files.map((f) => f.Name), draft_email_sent: draftEmailSent },
  });

  // sendEmail swallows delivery failures by default so the webhook itself
  // never breaks — but a failed "your draft is ready" send is otherwise
  // completely invisible: the draft still exists, nothing else errors, and
  // no one is told the stakeholder was never actually notified. Surface it.
  if (!draftEmailSent) {
    try {
      await auditLog("email.draft_notification_failed", user.id, user.email, {
        orgId: org.id,
        projectId,
        metadata: { message_id: payload.MessageID },
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
      // Best-effort visibility only — must never turn a delivery hiccup into
      // a 500 that makes Postmark retry the whole webhook.
      console.error("[email-webhook] Failed to raise draft-notification-failed alert (non-fatal):", err);
    }
  }
}

async function handleThreadReply(
  payload: ReturnType<typeof parseInboundPayload> & object,
  projectId: string,
  user: { id: string; email: string; client_id: string },
  supabase: ReturnType<typeof createAdminClient>
) {
  // Validate the project exists and belongs to the user's org
  const { data: project } = await supabase
    .from("projects")
    .select("id, client_id, status, template_id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();

  if (!project || project.client_id !== user.client_id || project.status !== "draft") {
    await auditLog("email.thread_reply_invalid", user.id, user.email, {
      metadata: { mailbox_hash: projectId, message_id: payload.MessageID },
    });
    return;
  }

  const supportedFiles = payload.Attachments.filter((a: PostmarkAttachment) =>
    isSupportedAttachment(a.ContentType)
  );

  if (supportedFiles.length === 0) {
    return;
  }

  const pdfBuffers: Buffer[] = [];

  for (const attachment of supportedFiles) {
    const buffer = attachmentBuffer(attachment);
    const storagePath = `${user.client_id}/${projectId}/${attachment.Name}`;

    const { error: uploadError } = await supabase.storage
      .from("submissions")
      .upload(storagePath, buffer, {
        contentType: attachment.ContentType,
        upsert: true,
      });

    if (uploadError) {
      console.error(`[email-webhook] Thread upload failed for ${attachment.Name}:`, uploadError);
      continue;
    }

    // Upsert: if a file with the same path already exists, skip inserting a duplicate row
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
        uploaded_by: user.id,
      });
    }

    if (attachment.ContentType === "application/pdf") {
      pdfBuffers.push(buffer);
    }
  }

  // Re-run extraction and merge new results into extracted_fields
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

      // Fetch current extracted_fields to merge
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
      console.error("[email-webhook] Thread extraction failed (non-fatal):", err);
    }
  }

  await auditLog("email.thread_attachments_added", user.id, user.email, {
    projectId,
    metadata: { message_id: payload.MessageID, attachments: supportedFiles.map((f: PostmarkAttachment) => f.Name) },
  });
}

// A reply to a stakeholder's approval-request email (#68). The token proves the
// sender received this specific email; it does not prove they *are* the
// stakeholder (a forward or a shared inbox could reply too), so we separately
// check the sender against the project/client stakeholder roster and record
// whether it matched. No approve/reject interpretation happens here — the
// consultant resolves it manually via the #65 form.
async function handleStakeholderEmailReply(
  payload: ReturnType<typeof parseInboundPayload> & object,
  review: {
    id: string;
    project_id: string;
    stakeholder_email: string;
    stakeholder_name: string;
  },
  fromEmail: string,
  supabase: ReturnType<typeof createAdminClient>
) {
  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, client_id, submitted_by, assigned_consultant_id, qa_completed_by, extracted_fields, project_number"
    )
    .eq("id", review.project_id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!project) {
    await auditLog("email.stakeholder_reply_invalid", null, fromEmail, {
      metadata: { review_id: review.id, message_id: payload.MessageID, reason: "project not found" },
    });
    return;
  }

  const knownEmails = new Set<string>([review.stakeholder_email.toLowerCase()]);
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
  const verified = knownEmails.has(fromEmail.toLowerCase());

  // Prefer Postmark's own quote/signature-stripped reply when present — pure
  // structural stripping, not an AI read of the content, so it doesn't
  // conflict with #68's "no auto-interpretation" requirement. Falls back to
  // the full TextBody (e.g. hand-built test payloads that lack the field).
  const replyText = (payload.StrippedTextReply || payload.TextBody || "").trim();
  const receivedAt = new Date().toISOString();

  await supabase
    .from("stakeholder_reviews")
    .update({
      email_reply_text: replyText,
      email_reply_received_at: receivedAt,
      email_reply_sender_verified: verified,
    })
    .eq("id", review.id);

  // Store the reply as evidence, linked to this review via the #57 reference
  // convention, so it's already attached when the consultant resolves it
  // through the #65 manual-capture form. Keeps the full original body (not
  // the stripped version) — evidence should be the complete correspondence.
  const uploadedBy = (project.assigned_consultant_id as string | null) ?? (project.submitted_by as string);
  const evidenceFileId = await archiveInboundEmailAsEvidence(
    payload,
    fromEmail,
    project.client_id as string,
    project.id as string,
    uploadedBy,
    `stakeholder_review:${review.id}`,
    supabase
  );

  await auditLog("stakeholder.email_reply_received", null, fromEmail, {
    projectId: project.id as string,
    orgId: project.client_id as string,
    metadata: {
      review_id: review.id,
      message_id: payload.MessageID,
      sender_verified: verified,
      evidence_file_id: evidenceFileId,
    },
  });

  // Independent consultant notification — decided not to route through #46's
  // "needs attention" chit, which doesn't exist yet (see issue #68 body).
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
}

// ── Email HTML builders ───────────────────────────────────────────────────────

function unrecognisedSenderHtml(email: string): string {
  return `<p>Hi,</p>
<p>We received an email from <strong>${email}</strong> but could not find an OPS account registered to this address.</p>
<p>If you believe this is an error, please contact your OPS account manager to ensure your email address is registered.</p>
<p>Regards,<br>OPS Team</p>`;
}

function whitelistBlockedHtml(email: string): string {
  return `<p>Hi,</p>
<p>Email submissions from <strong>${email}</strong> are not permitted for your organisation. Please submit your report request via the OPS portal.</p>
<p>Regards,<br>OPS Team</p>`;
}

function noAttachmentHtml(email: string, orgName: string): string {
  return `<p>Hi,</p>
<p>We received your email for <strong>${orgName}</strong> but could not find any supported file attachments (PDF, JPG, PNG, or TIFF).</p>
<p>Please either:</p>
<ul>
  <li>Reply to this email with your Purchase Order and building plans attached, or</li>
  <li>Submit your request directly via the <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/portal/submit">OPS portal</a>.</li>
</ul>
<p>Regards,<br>OPS Team</p>`;
}

function portalLinkHtml(email: string, orgName: string, portalLink: string): string {
  return `<p>Hi,</p>
<p>We've received your documents for <strong>${orgName}</strong> and pre-filled a draft report request with the extracted information.</p>
<p>Please <a href="${portalLink}">click here to review and confirm your draft</a> before it is processed. You may need to log in first.</p>
<p>If any fields look incorrect, you can edit them in the portal before submitting.</p>
<p>If you have additional documents to attach, simply reply to this email with them included.</p>
<p>Regards,<br>OPS Team</p>`;
}

function duplicateAddressHtml(email: string, siteAddress: string, existingProjectId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `<p>Hi,</p>
<p>We received your email but detected a duplicate address: <strong>${siteAddress}</strong>.</p>
<p>An active project for this address already exists. Please <a href="${appUrl}/portal/projects/${existingProjectId}">view the existing project</a> or contact your OPS account manager if you believe this is incorrect.</p>
<p>Regards,<br>OPS Team</p>`;
}
