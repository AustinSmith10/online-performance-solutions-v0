import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sender";
import type { NotificationType } from "./types";

export interface NotifyOptions {
  recipientId: string;
  type: NotificationType;
  message: string;
  projectId?: string;
  emailSubject: string;
  emailHtml: string;
  replyTo?: string;
}

export async function notify({
  recipientId,
  type,
  message,
  projectId,
  emailSubject,
  emailHtml,
  replyTo,
}: NotifyOptions): Promise<void> {
  const admin = createAdminClient();

  const [notifResult, userResult] = await Promise.all([
    admin.from("notifications").insert({
      recipient_id: recipientId,
      project_id: projectId ?? null,
      type,
      message,
    }),
    admin.from("users").select("email").eq("id", recipientId).single(),
  ]);

  if (notifResult.error) {
    console.error("[notify] failed to write notification row:", notifResult.error);
    throw new Error("Failed to write notification");
  }

  if (userResult.error || !userResult.data?.email) {
    console.error("[notify] could not resolve recipient email:", userResult.error);
    await admin.from("email_send_log").insert({
      to_email: `(unresolved recipient: ${recipientId})`,
      subject: emailSubject,
      source: `notify:${type}`,
      project_id: projectId ?? null,
      status: "failed",
      error: "Could not resolve recipient email",
    });
    return;
  }

  await sendEmail({
    to: userResult.data.email,
    subject: emailSubject,
    html: emailHtml,
    source: `notify:${type}`,
    projectId,
    ...(replyTo ? { replyTo } : {}),
  });
}
