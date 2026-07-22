const FROM = process.env.EMAIL_FROM ?? "OPS <noreply@ddeg.com.au>";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  /**
   * Rethrow delivery failures instead of swallowing them. Off by default so
   * application callers are never blocked by email problems; opt in from
   * scripts and tests that need to know whether the send actually succeeded.
   */
  throwOnError?: boolean;
  /** Short identifier for the calling code path, e.g. "invite", "stakeholder_dispatch". Shown in the admin delivery log. */
  source: string;
  /** Project this send relates to, if any — lets the admin log filter/link back to a project. */
  projectId?: string;
}

async function logSend(fields: { to: string; subject: string; source: string; projectId?: string; status: "sent" | "failed"; error?: string }) {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    await admin.from("email_send_log").insert({
      to_email: fields.to,
      subject: fields.subject,
      source: fields.source,
      project_id: fields.projectId ?? null,
      status: fields.status,
      error: fields.error?.slice(0, 2000) ?? null,
    });
  } catch (logError) {
    console.error("[email] failed to write email_send_log:", logError);
  }
}

/**
 * Resolves to whether the send actually succeeded — callers that don't need
 * this (the majority, per the fire-and-forget default below) can simply not
 * check it; callers that want to react to a silent failure (e.g. notify an
 * admin) can await and inspect it instead of reaching for throwOnError.
 */
export async function sendEmail({ to, subject, html, replyTo, throwOnError, source, projectId }: SendEmailOptions): Promise<boolean> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    console.warn("[email] POSTMARK_SERVER_TOKEN not set — skipping send");
    await logSend({ to, subject, source, projectId, status: "failed", error: "POSTMARK_SERVER_TOKEN not set — nothing was sent" });
    if (throwOnError) throw new Error("POSTMARK_SERVER_TOKEN not set — nothing was sent");
    return false;
  }
  const { ServerClient } = await import("postmark");
  const client = new ServerClient(token);
  try {
    await client.sendEmail({
      From: FROM,
      To: to,
      Subject: subject,
      HtmlBody: html,
      ...(replyTo ? { ReplyTo: replyTo } : {}),
    });
    await logSend({ to, subject, source, projectId, status: "sent" });
    return true;
  } catch (error) {
    // Log but do not throw by default — callers must not be blocked by email
    // delivery failures unless they opt in via throwOnError.
    console.error("[email] send failed:", error);
    const message = error instanceof Error ? error.message : String(error);
    await logSend({ to, subject, source, projectId, status: "failed", error: message });
    if (throwOnError) throw error;
    return false;
  }
}
