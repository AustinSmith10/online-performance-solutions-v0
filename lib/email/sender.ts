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
}

export async function sendEmail({ to, subject, html, replyTo, throwOnError }: SendEmailOptions): Promise<void> {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    console.warn("[email] POSTMARK_SERVER_TOKEN not set — skipping send");
    if (throwOnError) throw new Error("POSTMARK_SERVER_TOKEN not set — nothing was sent");
    return;
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
  } catch (error) {
    // Log but do not throw — callers must not be blocked by email delivery failures.
    console.error("[email] send failed:", error);
    if (throwOnError) throw error;
  }
}
