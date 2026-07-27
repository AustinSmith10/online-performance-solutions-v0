import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Given a page of user emails, returns the subset whose most recent invite
 * (or resend) attempt failed. "Most recent" matters: an old failed row that
 * was later followed by a successful resend shouldn't still flag the user.
 */
export async function getFailedInviteEmails(
  supabase: SupabaseClient,
  emails: string[]
): Promise<Set<string>> {
  if (emails.length === 0) return new Set();

  const { data } = await supabase
    .from("email_send_log")
    .select("to_email, status, created_at")
    .in("to_email", emails)
    .in("source", ["invite", "invite_resend"])
    .order("created_at", { ascending: true });

  const latestStatusByEmail = new Map<string, string>();
  for (const row of (data ?? []) as { to_email: string; status: string }[]) {
    latestStatusByEmail.set(row.to_email, row.status);
  }

  const failed = new Set<string>();
  for (const [email, status] of latestStatusByEmail) {
    if (status === "failed") failed.add(email);
  }
  return failed;
}
