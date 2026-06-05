import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types";

export async function sendInvite(
  email: string,
  role: UserRole,
  orgId: string
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/confirm`,
    data: { role, org_id: orgId },
  });

  if (error) return { error: error.message };
  if (!data.user) return { error: "Failed to create invite" };

  // Set role in app_metadata so it appears in the JWT (service-role only field)
  await supabase.auth.admin.updateUserById(data.user.id, {
    app_metadata: { role, org_id: orgId },
  });

  // Pre-create the public users row
  const { error: insertError } = await supabase.from("users").insert({
    id: data.user.id,
    email,
    role,
    org_id: orgId,
    invited_at: new Date().toISOString(),
  });

  if (insertError) return { error: insertError.message };

  return { userId: data.user.id };
}
