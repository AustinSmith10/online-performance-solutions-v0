import "server-only";
import { Resend } from "resend";
import type { ReactElement } from "react";

const FROM = process.env.EMAIL_FROM ?? "OPS <noreply@ddeg.com.au>";

export interface SendEmailOptions {
  to: string;
  subject: string;
  react: ReactElement;
}

export async function sendEmail({ to, subject, react }: SendEmailOptions): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[email] RESEND_API_KEY not set — skipping send");
    return;
  }
  const { Resend } = await import("resend");
  const resend = new Resend(key);
  const { error } = await resend.emails.send({ from: FROM, to, subject, react });
  if (error) {
    console.error("[email] send failed:", error);
    throw new Error(`Email send failed: ${error.message}`);
  }
}
