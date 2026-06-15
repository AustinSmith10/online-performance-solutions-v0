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

// Postmark retries on non-2xx — always return 200 so it doesn't retry on expected failures.

export async function POST(req: NextRequest) {
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
    .select("id, email, org_id, role")
    .eq("email", fromEmail)
    .single();

  if (!user || !user.org_id) {
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

  // Only client users can submit via email
  if (user.role !== "client") {
    return NextResponse.json({ ok: true });
  }

  // ── 2. Email whitelist check ───────────────────────────────────────────────
  const { data: org } = await supabase
    .from("organisations")
    .select("id, name, email_whitelist, abandoned_draft_days")
    .eq("id", user.org_id)
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
  user: { id: string; email: string; org_id: string },
  org: { id: string; name: string },
  supabase: ReturnType<typeof createAdminClient>
) {
  // Resolve active template for the org
  const { data: templates } = await supabase
    .from("templates")
    .select("id")
    .eq("org_id", org.id)
    .eq("status", "active")
    .limit(1);

  const templateId = templates?.[0]?.id ?? null;

  // Create draft project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      org_id: org.id,
      template_id: templateId,
      submitted_by: user.id,
      status: "draft",
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
    const fileType = i === 0 && attachment.ContentType === "application/pdf" ? "po" : "building_plans";

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
      const poBuffer = pdfBuffers[0];
      const plansBuffer = pdfBuffers[1] ?? pdfBuffers[0];
      const extracted = await extractDocumentFields(poBuffer, plansBuffer);

      // Check duplicate PO
      if (extracted.po_number.value) {
        const { data: dupe } = await supabase
          .from("projects")
          .select("id")
          .eq("org_id", org.id)
          .eq("po_number", extracted.po_number.value)
          .is("deleted_at", null)
          .not("status", "in", '("delivered","complete")')
          .maybeSingle();

        if (dupe) {
          await sendEmail({
            to: user.email,
            subject: "OPS: Duplicate PO number detected",
            html: duplicatePoHtml(user.email, extracted.po_number.value, dupe.id),
          });
          await auditLog("email.duplicate_po", user.id, user.email, {
            orgId: org.id,
            projectId: projectId,
            metadata: { po_number: extracted.po_number.value, existing_project_id: dupe.id },
          });
          // Soft-delete the just-created draft — it's a duplicate
          await supabase
            .from("projects")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", projectId);
          return;
        }
      }

      // Save extracted fields and PO number to the project
      await supabase
        .from("projects")
        .update({
          extracted_fields: extracted,
          ...(extracted.po_number.value ? { po_number: extracted.po_number.value } : {}),
        })
        .eq("id", projectId);
    } catch (err) {
      console.error("[email-webhook] Extraction failed (non-fatal):", err);
    }
  }

  // Send portal link with threading Reply-To
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const portalLink = `${appUrl}/portal/projects/${projectId}`;
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
  user: { id: string; email: string; org_id: string },
  supabase: ReturnType<typeof createAdminClient>
) {
  // Validate the project exists and belongs to the user's org
  const { data: project } = await supabase
    .from("projects")
    .select("id, org_id, status")
    .eq("id", projectId)
    .is("deleted_at", null)
    .single();

  if (!project || project.org_id !== user.org_id || project.status !== "draft") {
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
    const storagePath = `${user.org_id}/${projectId}/${attachment.Name}`;

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
        file_type: "building_plans",
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
      const poBuffer = pdfBuffers[0];
      const plansBuffer = pdfBuffers[1] ?? pdfBuffers[0];
      const extracted = await extractDocumentFields(poBuffer, plansBuffer);

      // Fetch current extracted_fields to merge
      const { data: current } = await supabase
        .from("projects")
        .select("extracted_fields, po_number")
        .eq("id", projectId)
        .single();

      const merged = { ...(current?.extracted_fields ?? {}), ...extracted };

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

function duplicatePoHtml(email: string, poNumber: string, existingProjectId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  return `<p>Hi,</p>
<p>We received your email but detected a duplicate PO number: <strong>${poNumber}</strong>.</p>
<p>A project with this PO number already exists. Please <a href="${appUrl}/portal/projects/${existingProjectId}">view the existing project</a> or contact your OPS account manager if you believe this is incorrect.</p>
<p>Regards,<br>OPS Team</p>`;
}
