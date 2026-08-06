import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notifications/notify";
import { sendEmail } from "@/lib/email/sender";
import { renderPbdrDeliveryEmail } from "@/lib/email/templates/PBDRDeliveryEmail";

export interface DeliverPbdrEmailsParams {
  supabase: SupabaseClient;
  projectId: string;
  /** Reference shown inside the email body — may differ from the subject line's ref. */
  templateProjectRef: string;
  submittedBy: string | null;
  deliveryRecipientEmail: string | null;
  downloadUrl: string;
  expiresAt: string;
  subject: string;
  notifyTitle?: string;
  notifyMessage: string;
  /** `sendEmail`'s `source` tag for the delivery_recipient branch — kept distinct per call site for the email_send_log. */
  recipientEmailSource: string;
  logPrefix: string;
}

/**
 * Emails the PBDR download link to the project submitter (via `notify`, which
 * also writes an in-app notification) and, if set and not the same address,
 * to `delivery_recipient_email` as a plain send. Shared by every place that
 * hands a PBDR to a client — initial delivery, admin resend, and the local
 * dev script — so subject/URL wording can't drift between them.
 */
export async function deliverPbdrEmails({
  supabase,
  projectId,
  templateProjectRef,
  submittedBy,
  deliveryRecipientEmail,
  downloadUrl,
  expiresAt,
  subject,
  notifyTitle,
  notifyMessage,
  recipientEmailSource,
  logPrefix,
}: DeliverPbdrEmailsParams): Promise<void> {
  const { data: submitter } = submittedBy
    ? await supabase
        .from("users")
        .select("id, email, first_name, last_name")
        .eq("id", submittedBy)
        .maybeSingle()
    : { data: null };

  if (submitter) {
    const name =
      [submitter.first_name as string | null, submitter.last_name as string | null]
        .filter(Boolean)
        .join(" ") || (submitter.email as string);

    await notify({
      recipientId: submitter.id as string,
      type: "pbdr_delivery",
      title: notifyTitle,
      message: notifyMessage,
      projectId,
      emailSubject: subject,
      emailHtml: renderPbdrDeliveryEmail({
        recipientName: name,
        projectId: templateProjectRef,
        downloadUrl,
        expiresAt,
      }),
    }).catch((err) => console.error(`${logPrefix} submitter notify failed:`, err));
  }

  if (deliveryRecipientEmail) {
    const submitterEmail = (submitter?.email as string | null)?.toLowerCase();
    if (deliveryRecipientEmail.toLowerCase() !== submitterEmail) {
      await sendEmail({
        to: deliveryRecipientEmail,
        subject,
        html: renderPbdrDeliveryEmail({
          recipientName: deliveryRecipientEmail,
          projectId: templateProjectRef,
          downloadUrl,
          expiresAt,
        }),
        source: recipientEmailSource,
        projectId,
      }).catch((err) => console.error(`${logPrefix} delivery_recipient email failed:`, err));
    }
  }
}
