"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { sendInvite } from "@/lib/auth/invite";
import { auditLog } from "@/lib/audit/log";
import type { ConsultantAvailability } from "@/types";

export type DeleteUserState = { error?: string };

export async function deleteUser(
  userId: string,
  _prev: DeleteUserState,
  _formData: FormData
): Promise<DeleteUserState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  // Read email/role before deletion for the audit entry
  const { data: user } = await supabase
    .from("users")
    .select("email, role")
    .eq("id", userId)
    .single();

  if (!user) return { error: "User not found." };

  if (actor.role === "admin" && (user.role === "super_admin" || user.role === "admin")) {
    return { error: "Insufficient permissions to delete this account." };
  }

  // Delegate to the SQL function — it validates, handles audit_log trigger, and deletes
  const { error } = await supabase.rpc("admin_delete_user", { p_user_id: userId });
  if (error) {
    // The SQL function raises human-readable exceptions for blocking conditions
    return { error: error.message };
  }

  await auditLog("user.deleted", actor.id, actor.email, {
    metadata: { target_user_id: userId, target_email: user.email, role: user.role },
  });

  revalidatePath("/admin/users");
  revalidatePath("/admin/clients");
  revalidatePath("/admin/consultants");
  redirect("/admin/users");
}

export type ResetPasswordState = { link?: string; error?: string };

export async function resetUserPassword(
  userId: string,
  _prev: ResetPasswordState,
  _formData: FormData
): Promise<ResetPasswordState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: authUser, error: fetchError } = await supabase.auth.admin.getUserById(userId);
  if (fetchError || !authUser.user?.email) return { error: "User not found." };

  const email = authUser.user.email;

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password` },
  });

  if (error) return { error: error.message };

  await auditLog("auth.password_reset_generated", actor.id, actor.email, {
    metadata: { target_user_id: userId, target_email: email },
  });

  return { link: data.properties.action_link };
}

const InviteSchema = z.object({
  email: z.string().email({ error: "Valid email required" }).trim().toLowerCase(),
  role: z.enum(["client", "consultant", "admin"], { error: "Invalid role" }),
  org_id: z.string().uuid({ error: "Invalid organisation" }).optional().or(z.literal("")),
});

export type InviteUserState = {
  errors?: {
    email?: string[];
    role?: string[];
    org_id?: string[];
    form?: string[];
  };
};

export async function inviteUser(
  _prev: InviteUserState,
  formData: FormData
): Promise<InviteUserState> {
  const caller = await requireRole("super_admin", "admin");

  const rawOrgId = formData.get("org_id") as string | null;
  const validated = InviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    org_id: rawOrgId || undefined,
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email, role, org_id } = validated.data;

  if (role === "admin" && caller.role !== "super_admin") {
    return { errors: { role: ["Only a Super Admin can invite Admin users"] } };
  }

  if (role === "client" && !org_id) {
    return { errors: { org_id: ["Organisation required for client users"] } };
  }

  const result = await sendInvite(email, role, org_id || undefined);
  if (result.error) return { errors: { form: [result.error] } };

  revalidatePath("/admin/users");
  redirect(`/admin/users/${result.userId}`);
}

export async function unlockUser(userId: string) {
  const caller = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();
  const { data: target } = await supabase.from("users").select("role").eq("id", userId).single();
  if (caller.role === "admin" && target && (target.role === "super_admin" || target.role === "admin")) {
    throw new Error("Insufficient permissions.");
  }

  const { error } = await supabase
    .from("users")
    .update({ is_locked: false, failed_login_count: 0 })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function setConsultantAvailability(
  userId: string,
  availability: ConsultantAvailability
) {
  await requireRole("super_admin", "admin");

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ availability })
    .eq("id", userId);

  if (error) throw new Error(error.message);

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const EditUserSchema = z.object({
  first_name: z.string().min(1, { error: "First name required" }).trim(),
  last_name: z.string().min(1, { error: "Last name required" }).trim(),
  phone: z.string().trim().optional().or(z.literal("")),
  company_role: z.string().trim().optional().or(z.literal("")),
  state_territory: z.enum(AU_STATES as [string, ...string[]], {
    error: "Select a valid state or territory",
  }),
  org_id: z.string().uuid({ error: "Invalid organisation" }).optional().or(z.literal("")),
});

export type EditUserState = {
  saved?: boolean;
  errors?: {
    first_name?: string[];
    last_name?: string[];
    phone?: string[];
    company_role?: string[];
    state_territory?: string[];
    org_id?: string[];
    form?: string[];
  };
};

export async function resetUserTotp(userId: string) {
  const actor = await requireRole("super_admin", "admin");

  const supabase = createAdminClient();

  const { data: factorData } = await supabase.auth.admin.mfa.listFactors({ userId });
  const totpFactors = factorData?.factors?.filter((f) => f.factor_type === "totp") ?? [];
  await Promise.all(
    totpFactors.map((f) => supabase.auth.admin.mfa.deleteFactor({ userId, id: f.id }))
  );

  const { error } = await supabase.from("users").update({ totp_enabled: false }).eq("id", userId);
  if (error) throw new Error(error.message);

  await auditLog("auth.2fa_disabled", actor.id, actor.email, {
    metadata: { target_user_id: userId, factors_removed: totpFactors.length },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function requireUserTotp(userId: string) {
  const actor = await requireRole("super_admin", "admin");

  const supabase = createAdminClient();

  // Clear any stale unverified (partial) TOTP enrollment so the user starts fresh
  const { data: factorData } = await supabase.auth.admin.mfa.listFactors({ userId });
  const unverifiedFactors =
    factorData?.factors?.filter(
      (f) => f.factor_type === "totp" && (f.status as string) === "unverified"
    ) ?? [];
  await Promise.all(
    unverifiedFactors.map((f) => supabase.auth.admin.mfa.deleteFactor({ userId, id: f.id }))
  );

  await auditLog("auth.2fa_required", actor.id, actor.email, {
    metadata: { target_user_id: userId },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
}

export async function updateUserProfile(
  userId: string,
  _prev: EditUserState,
  formData: FormData
): Promise<EditUserState> {
  await requireRole("super_admin", "admin");

  const rawOrgId = formData.get("org_id") as string | null;
  const validated = EditUserSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    phone: formData.get("phone") || undefined,
    company_role: formData.get("company_role") || undefined,
    state_territory: formData.get("state_territory"),
    org_id: rawOrgId || undefined,
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { org_id, phone, company_role, ...rest } = validated.data;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({
      ...rest,
      phone: phone || null,
      company_role: company_role || null,
      org_id: org_id || null,
    })
    .eq("id", userId);

  if (error) return { errors: { form: [error.message] } };

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/consultants");
  return { saved: true };
}
