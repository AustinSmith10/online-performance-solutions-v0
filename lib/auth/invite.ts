import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/sender";
import { WelcomeAccountEmail } from "@/lib/email/templates/WelcomeAccountEmail";
import type { UserRole } from "@/types";

export async function createAccount(
  email: string,
  role: UserRole,
  firstName: string,
  lastName: string,
  orgId?: string
) {
  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";

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
  });

  return { userId };
}
