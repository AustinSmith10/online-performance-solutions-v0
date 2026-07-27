import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { isPostmarkWebhookAuthorized } from "@/lib/email/webhook-auth";

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
    console.error("[email-bounce-webhook] payload missing Email:", body);
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

  const { error: insertError } = await supabase.from("bounce_events").insert({
    email,
    project_id: projectId,
    reason,
    type: isComplaint ? "complaint" : "bounce",
    message_id: body.MessageID ?? null,
    raw_payload: body as unknown as Record<string, unknown>,
  });

  if (insertError) {
    console.error("[email-bounce-webhook] failed to insert bounce_events row:", insertError);
    return NextResponse.json({ ok: true });
  }

  await auditLog(isComplaint ? "email.complaint_received" : "email.bounce_received", null, email, {
    projectId: projectId ?? undefined,
    metadata: { type: body.Type ?? null, message_id: body.MessageID ?? null },
  });

  return NextResponse.json({ ok: true });
}
