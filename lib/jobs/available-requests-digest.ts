import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/sender";
import { renderAvailableRequestsDigestEmail } from "@/lib/email/templates/AvailableRequestsDigestEmail";

const DIGEST_RECIPIENT_ROLES = ["super_admin", "admin", "consultant"];

export async function sendAvailableRequestsDigest(
  supabase: SupabaseClient
): Promise<{ sent: boolean; count: number; recipients: number }> {
  const { count, error: countError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("status", "submitted")
    .is("assigned_consultant_id", null)
    .is("deleted_at", null);

  if (countError) {
    console.error("[available-requests-digest] count query failed:", countError);
    return { sent: false, count: 0, recipients: 0 };
  }

  const available = count ?? 0;
  if (available === 0) {
    return { sent: false, count: 0, recipients: 0 };
  }

  const { data: recipients, error: recipientsError } = await supabase
    .from("users")
    .select("email")
    .in("role", DIGEST_RECIPIENT_ROLES)
    .eq("is_active", true);

  if (recipientsError) {
    console.error("[available-requests-digest] recipients query failed:", recipientsError);
    return { sent: false, count: available, recipients: 0 };
  }

  const emails = (recipients ?? [])
    .map((r) => r.email as string | null)
    .filter((email): email is string => Boolean(email));

  const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/ops`;
  const html = renderAvailableRequestsDigestEmail({ count: available, portalUrl });
  const subject = `You have ${available} available request${available === 1 ? "" : "s"}`;

  await Promise.all(
    emails.map((to) =>
      sendEmail({ to, subject, html, source: "available_requests_digest" }).catch((err) =>
        console.error(`[available-requests-digest] email to ${to} failed:`, err)
      )
    )
  );

  return { sent: true, count: available, recipients: emails.length };
}
