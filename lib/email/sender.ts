const FROM = process.env.EMAIL_FROM ?? "OPS <noreply@ddeg.com.au>";

export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendEmail({ to, subject, html, replyTo }: SendEmailOptions): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping send");
    return;
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
  if (error) {
    // Log but do not throw — callers must not be blocked by email delivery failures.
    console.error("[email] send failed:", error);
  }
}
