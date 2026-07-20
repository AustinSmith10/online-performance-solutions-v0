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
      for (const [token, rawCandidates] of Object.entries(extracted.candidates)) {
        if (rawCandidates.length === 0) continue;
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

  await sendEmail({
    to: user.email,
    subject: "OPS: Your report request draft is ready",
    html: portalLinkHtml(user.email, org.name as string, portalLink),
    ...(replyTo ? { replyTo } : {}),
  });

  await auditLog("email.draft_created", user.id, user.email, {
    orgId: org.id,
    projectId,
    metadata: { message_id: payload.MessageID, attachments: files.map((f) => f.Name) },
  });
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
