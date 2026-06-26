import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/types";

// Per-role session duration in milliseconds
export const SESSION_DURATION: Record<UserRole, number> = {
  client: 8 * 60 * 60 * 1000,
  consultant: 4 * 60 * 60 * 1000,
  admin: 4 * 60 * 60 * 1000,
  super_admin: 4 * 60 * 60 * 1000,
};

export const SESSION_EXPIRY_COOKIE = "ops-session-expires";

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;

  const adminClient = createAdminClient();
  const { data: profile } = await adminClient
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile ?? null;
}

export async function requireRole(...roles: UserRole[]) {
  const profile = await getSessionUser();
  if (!profile) redirect("/login");
  if (!roles.includes(profile.role as UserRole)) redirect("/");
  return profile;
}
