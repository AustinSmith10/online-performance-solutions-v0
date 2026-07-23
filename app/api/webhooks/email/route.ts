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
  type PostmarkInboundEmail,
} from "@/lib/email/parser";
import { validateToken } from "@/lib/stakeholders/tokens";

// Postmark retries on non-2xx — always return 200 so it doesn't retry on expected failures.
// This does not apply to auth failures below: Postmark won't retry with different
// credentials, so a 401 there is safe and won't trigger a retry storm.

function isAuthorized(req: NextRequest): boolean {
  const user = process.env.POSTMARK_INBOUND_WEBHOOK_USER;
  const password = process.env.POSTMARK_INBOUND_WEBHOOK_PASSWORD;
  if (!user || !password) {
    if (process.env.NODE_ENV === "production") {
      console.error("[email-webhook] POSTMARK_INBOUND_WEBHOOK_* not set in production — rejecting request");
      return false;
    }
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

type ProposedCategory = "new_submission" | "thread_reply" | "stakeholder_response";
type MatchReason = "token_match" | "mailbox_hash_projectid_match" | "stakeholder_table_fallback" | "no_match";

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

  // ── -1. Clarification-reply token match (#101 follow-up) ───────────────────
  // A stakeholder_table_fallback queue entry has no project/review link at
  // all, so an admin/consultant may have asked the sender to self-identify
  // (requestClarification action, app/actions/email-queue.ts) via an email
  // carrying this per-row token. Checked before the stakeholder-review token
  // below since it's a distinct token space keyed on the same MailboxHash
  // mechanism (lib/email/parser.ts's buildStakeholderReplyTo).
  if (payload.MailboxHash) {
    const { data: awaiting } = await supabase
      .from("inbound_email_queue")
      .select("id, status")
      .eq("clarification_token", payload.MailboxHash)
      .gt("clarification_expires_at", new Date().toISOString())
      .maybeSingle();

    if (awaiting) {
      const replyText = payload.StrippedTextReply || payload.TextBody || null;
      await supabase
        .from("inbound_email_queue")
        .update({
          clarification_reply_text: replyText,
          // Only reactivate if it was actually waiting — a stray second
          // reply to an already-resolved entry shouldn't reopen it.
          ...(awaiting.status === "awaiting_clarification" ? { status: "pending" } : {}),
        })
        .eq("id", awaiting.id as string);

      await auditLog("email.clarification_replied", null, fromEmail, {
        metadata: { queue_id: awaiting.id, message_id: payload.MessageID },
      });

      await sendEmail({
        to: fromEmail,
        subject: "OPS: We've received your reply",
        html: holdingReplyHtml(),
        source: "webhook_clarification_reply_holding",
      });

      return NextResponse.json({ ok: true });
    }
  }

  // ── 0. Stakeholder-reply token match (#68's MailboxHash token) ─────────────
  // Checked before the sender-lookup gate below: third-party stakeholders who
  // reply to their approval email typically have no `users` row at all (they're
  // in the `stakeholders` table, not portal accounts), so the ordinary
  // sender-lookup gate would otherwise bounce every one of these replies as an
  // "unrecognised sender". The token itself is the credential here.
  //
  // Uses the same validateToken() helper the approval-portal actions use
  // (#99) rather than a raw token lookup — an expired or non-"pending"
  // (already acknowledged/waived/modifications-requested) review's token
  // must not still count as a live match; it's simply treated as no match
  // and falls through to the ordinary sender-lookup gate below.
  if (payload.MailboxHash) {
    const validated = await validateToken(payload.MailboxHash);

    if (validated && !validated.isExpired && validated.review.status === "pending") {
      const review = validated.review;
      await queueInboundEmail(payload, fromEmail, supabase, {
        category: "stakeholder_response",
        proposedProjectId: review.project_id,
        proposedStakeholderReviewId: review.id,
        matchReason: "token_match",
      });
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
    // New fallback (#98/#99): the sender may be a third-party reviewer known
    // to the `stakeholders` table (org- or project-scoped) even though they
    // have no `users` row and sent this without their reply token. A match
    // here always lands blank in the queue — losing the token means we've
    // lost the one thing that proved which project/review cycle this
    // relates to, so we don't guess (decision log #10).
    const { data: stakeholderMatch } = await supabase
      .from("stakeholders")
      .select("id")
      .ilike("email", fromEmail)
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    if (stakeholderMatch) {
      await queueInboundEmail(payload, fromEmail, supabase, {
        category: "stakeholder_response",
        proposedProjectId: null,
        proposedStakeholderReviewId: null,
        matchReason: "stakeholder_table_fallback",
      });
      return NextResponse.json({ ok: true });
    }

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
  // #99: org membership alone isn't enough to authorize this match — without
  // also checking that the sender is the project's actual submitter, any
  // stakeholder-role user in the same org who obtains a project's UUID
  // (e.g. by seeing/forwarding the "your draft is ready" email) could have
  // their email matched to someone else's draft.
  if (payload.MailboxHash) {
    const { data: project } = await supabase
      .from("projects")
      .select("id, client_id, status, submitted_by")
      .eq("id", payload.MailboxHash)
      .is("deleted_at", null)
      .maybeSingle();

    const validMatch =
      !!project &&
      project.client_id === user.client_id &&
      project.status === "draft" &&
      project.submitted_by === user.id;

    if (validMatch) {
      await queueInboundEmail(payload, fromEmail, supabase, {
        category: "thread_reply",
        proposedProjectId: project.id as string,
        proposedStakeholderReviewId: null,
        matchReason: "mailbox_hash_projectid_match",
      });
    } else {
      await auditLog("email.thread_reply_invalid", user.id, user.email, {
        metadata: { mailbox_hash: payload.MailboxHash, message_id: payload.MessageID },
      });
    }
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

  await queueInboundEmail(payload, fromEmail, supabase, {
    category: "new_submission",
    proposedProjectId: null,
    proposedStakeholderReviewId: null,
    matchReason: "no_match",
  });
  return NextResponse.json({ ok: true });
}

// ── Classify-and-queue (#98 hard gate) ──────────────────────────────────────
//
// Nothing — no draft creation, file filing, extraction, `stakeholder_reviews`
// update, or category-specific confirmation email — happens automatically
// anymore for the 3 real categories. This only stages the email (and its
// attachments, uploaded to a pending storage path) and sends a generic
// holding auto-reply. The real pipeline (see lib/email/inbound-handlers.ts)
// runs later, once an admin/consultant approves the queue row.
async function queueInboundEmail(
  payload: PostmarkInboundEmail,
  fromEmail: string,
  supabase: ReturnType<typeof createAdminClient>,
  classification: {
    category: ProposedCategory;
    proposedProjectId: string | null;
    proposedStakeholderReviewId: string | null;
    matchReason: MatchReason;
  }
) {
  const queueId = crypto.randomUUID();

  const supportedFiles = payload.Attachments.filter((a) => isSupportedAttachment(a.ContentType));
  const attachmentPaths: { path: string; filename: string; content_type: string }[] = [];

  for (const attachment of supportedFiles) {
    const buffer = attachmentBuffer(attachment);
    const storagePath = `${queueId}/${attachment.Name}`;

    const { error: uploadError } = await supabase.storage
      .from("pending-inbound")
      .upload(storagePath, buffer, {
        contentType: attachment.ContentType,
        upsert: false,
      });

    if (uploadError) {
      console.error(`[email-webhook] Pending attachment upload failed for ${attachment.Name}:`, uploadError);
      continue;
    }

    attachmentPaths.push({ path: storagePath, filename: attachment.Name, content_type: attachment.ContentType });
  }

  const { error: insertError } = await supabase.from("inbound_email_queue").insert({
    id: queueId,
    from_email: fromEmail,
    from_name: payload.FromName || null,
    subject: payload.Subject || null,
    message_id: payload.MessageID || null,
    mailbox_hash: payload.MailboxHash || null,
    text_body: payload.TextBody || null,
    stripped_reply_text: payload.StrippedTextReply || null,
    attachment_paths: attachmentPaths,
    proposed_category: classification.category,
    proposed_project_id: classification.proposedProjectId,
    proposed_stakeholder_review_id: classification.proposedStakeholderReviewId,
    match_reason: classification.matchReason,
  });

  if (insertError) {
    console.error("[email-webhook] Failed to insert inbound email queue row:", insertError);
    return;
  }

  await auditLog("email.queued_for_review", null, fromEmail, {
    metadata: {
      message_id: payload.MessageID,
      queue_id: queueId,
      category: classification.category,
      match_reason: classification.matchReason,
    },
  });

  await sendEmail({
    to: fromEmail,
    subject: "OPS: We've received your email",
    html: holdingReplyHtml(),
    source: "webhook_holding_reply",
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

function holdingReplyHtml(): string {
  return `<p>Hi,</p>
<p>We've received your email and it's being reviewed. We'll follow up once it's been processed.</p>
<p>Regards,<br>OPS Team</p>`;
}
