import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { isPostmarkWebhookAuthorized } from "@/lib/email/webhook-auth";
import { logger } from "@/lib/observability/logger";

// Postmark retries on non-2xx — always return 200 so it doesn't retry on
// expected failures. Auth failures are the exception: Postmark won't retry
// with different credentials, so a 401 there is safe.

function isAuthorized(req: NextRequest): boolean {
  return isPostmarkWebhookAuthorized(
    req,
    "POSTMARK_BOUNCE_WEBHOOK_USER",
    "POSTMARK_BOUNCE_WEBHOOK_PASSWORD",
    "email-bounce-webhook"
  );
}

// Postmark sends Bounce and SpamComplaint events to the same webhook URL —
// they're distinguished by `Type` in the payload, not by a separate route.
// See https://postmarkapp.com/developer/webhooks/bounce-webhook
interface PostmarkBouncePayload {
  Type?: string;
  MessageID?: string;
  Email?: string;
  Description?: string;
  Details?: string;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: PostmarkBouncePayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const email = body.Email?.trim();
  if (!email) {
    logger.error({ event: "email-bounce-webhook.missing_email", payload: body }, "Bounce webhook payload missing Email");
    return NextResponse.json({ ok: true });
  }

  const isComplaint = body.Type === "SpamComplaint";
  const reason = [body.Type, body.Description || body.Details].filter(Boolean).join(": ") || null;

  const supabase = createAdminClient();

  // Correlate back to the send that triggered this, if we logged its
  // MessageID — gives the admin chit a project link without Postmark itself
  // knowing anything about our domain model.
  let projectId: string | null = null;
  if (body.MessageID) {
    const { data: sendLog } = await supabase
      .from("email_send_log")
      .select("project_id")
      .eq("message_id", body.MessageID)
      .maybeSingle();
    projectId = (sendLog?.project_id as string | null) ?? null;
  }

  // #150: Postmark retries on non-2xx or a slow response. (message_id, type)
  // — not plain message_id — is the dedupe key: Postmark sends a `Bounce`
  // and a `SpamComplaint` event for the same MessageID as genuinely distinct
  // events, and a plain message_id key would silently drop the second one.
  // upsert + ignoreDuplicates skips the insert on conflict rather than
  // erroring, and .select() lets us tell whether a row was actually written.
  const { data: insertedRows, error: insertError } = await supabase
    .from("bounce_events")
    .upsert(
      {
        email,
        project_id: projectId,
        reason,
        type: isComplaint ? "complaint" : "bounce",
        message_id: body.MessageID ?? null,
        raw_payload: body as unknown as Record<string, unknown>,
      },
      { onConflict: "message_id,type", ignoreDuplicates: true }
    )
    .select("id");

  if (insertError) {
    console.error("[email-bounce-webhook] failed to insert bounce_events row:", insertError);
    return NextResponse.json({ ok: true });
  }

  // A duplicate (message_id, type) pair — including the case where
  // message_id is null and the partial unique index doesn't apply, in which
  // case ignoreDuplicates never suppresses the insert and a row is always
  // returned — falls through to no row being reported as inserted only when
  // it truly collided, so skip the audit log rather than double-logging the
  // same bounce/complaint on a Postmark retry.
  if (!insertedRows || insertedRows.length === 0) {
    return NextResponse.json({ ok: true });
  }

  await auditLog(isComplaint ? "email.complaint_received" : "email.bounce_received", null, email, {
    projectId: projectId ?? undefined,
    metadata: { type: body.Type ?? null, message_id: body.MessageID ?? null },
  });

  return NextResponse.json({ ok: true });
}
