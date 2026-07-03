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
}

export async function notify({
  recipientId,
  type,
  message,
  projectId,
  emailSubject,
  emailHtml,
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
    return;
  }

  try {
    await sendEmail({ to: userResult.data.email, subject: emailSubject, html: emailHtml });
  } catch (err) {
    console.error("[notify] email send failed (non-fatal):", err);
  }
}
