import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sender";
import { WelcomeAccountEmail } from "@/lib/email/templates/WelcomeAccountEmail";
import type { UserRole } from "@/types";

/**
 * Generates a fresh password-setup link and sends the welcome email. Shared
 * by account creation and by an admin manually resending a failed invite —
 * the link itself is one-time-use, so a resend always needs a new one.
 */
export async function sendWelcomeEmail(
  email: string,
  role: UserRole,
  firstName: string,
  source: "invite" | "invite_resend" = "invite"
): Promise<{ error?: string }> {
  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return { error: "NEXT_PUBLIC_APP_URL is not set — cannot build the welcome email link" };
  }

  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${appUrl}/auth/update-password` },
  });

  if (linkError || !linkData?.properties?.action_link) {
    return { error: linkError?.message ?? "Failed to generate welcome link" };
  }

  await sendEmail({
    to: email,
    subject: "Your DDEG OPS account is ready",
    html: WelcomeAccountEmail({
      firstName,
      email,
      role,
      resetLink: linkData.properties.action_link,
      appUrl,
    }),
    source,
    throwOnError: true,
  });

  return {};
}

export async function createAccount(
  rawEmail: string,
  role: UserRole,
  firstName: string,
  lastName: string,
  orgId?: string
) {
  const supabase = createAdminClient();

  // Lowercase is the canonical stored form for every email column (#169) —
  // normalise here too as defence in depth, independent of caller validation.
  const email = rawEmail.trim().toLowerCase();

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role, client_id: orgId ?? null },
  });

  if (error) return { error: error.message };
  if (!data.user) return { error: "Failed to create account" };

  const userId = data.user.id;

  await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role, client_id: orgId ?? null },
  });

  const { error: insertError } = await supabase.from("users").insert({
    id: userId,
    email,
    role,
    first_name: firstName,
    last_name: lastName,
    client_id: orgId ?? null,
    invited_at: new Date().toISOString(),
  });

  if (insertError) return { error: insertError.message };

  const { error: emailError } = await sendWelcomeEmail(email, role, firstName).catch((err) => ({
    error: err instanceof Error ? err.message : String(err),
  }));
  if (emailError) return { error: emailError, userId };

  return { userId };
}
