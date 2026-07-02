"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { createAccount } from "@/lib/auth/invite";
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

  const { data: user } = await supabase
    .from("users")
    .select("email, role")
    .eq("id", userId)
    .single();

  if (!user) return { error: "User not found." };

  if (actor.role === "admin" && (user.role === "super_admin" || user.role === "admin")) {
    return { error: "Insufficient permissions to deactivate this account." };
  }

  const { error } = await supabase
    .from("users")
    .update({ is_active: false })
    .eq("id", userId);

  if (error) return { error: error.message };

  const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: "876600h",
  });
  if (banError) return { error: banError.message };

  await auditLog("user.deactivated", actor.id, actor.email, {
    metadata: { target_user_id: userId, target_email: user.email, role: user.role },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/stakeholders");
  revalidatePath("/admin/consultants");
  redirect(`/admin/users/${userId}?deleted=1`);
}

export type RestoreUserState = { error?: string };

export async function restoreUser(
  userId: string,
  _prev: RestoreUserState,
  _formData: FormData
): Promise<RestoreUserState> {
  const actor = await requireRole("super_admin", "admin");
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("email, role")
    .eq("id", userId)
    .single();

  if (!user) return { error: "User not found." };

  if (actor.role === "admin" && (user.role === "super_admin" || user.role === "admin")) {
    return { error: "Insufficient permissions to restore this account." };
  }

  const { error } = await supabase
    .from("users")
    .update({ is_active: true })
    .eq("id", userId);

  if (error) return { error: error.message };

  const { error: unbanError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });
  if (unbanError) return { error: unbanError.message };

  await auditLog("user.restored", actor.id, actor.email, {
    metadata: { target_user_id: userId, target_email: user.email, role: user.role },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/stakeholders");
  revalidatePath("/admin/consultants");
  redirect(`/admin/users/${userId}?restored=1`);
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

const CreateAccountSchema = z.object({
  email: z.string().email({ error: "Valid email required" }).trim().toLowerCase(),
  first_name: z.string().min(1, { error: "First name required" }).trim(),
  last_name: z.string().min(1, { error: "Last name required" }).trim(),
  role: z.enum(["stakeholder", "consultant", "admin"], { error: "Invalid role" }),
  client_id: z.string().uuid({ error: "Invalid organisation" }).optional().or(z.literal("")),
});

export type CreateAccountState = {
  errors?: {
    email?: string[];
    first_name?: string[];
    last_name?: string[];
    role?: string[];
    client_id?: string[];
    form?: string[];
  };
};

export async function createUserAccount(
  _prev: CreateAccountState,
  formData: FormData
): Promise<CreateAccountState> {
  const caller = await requireRole("super_admin", "admin");

  const rawOrgId = formData.get("client_id") as string | null;
  const validated = CreateAccountSchema.safeParse({
    email: formData.get("email"),
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    role: formData.get("role"),
    client_id: rawOrgId || undefined,
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email, first_name, last_name, role, client_id } = validated.data;

  if (role === "admin" && caller.role !== "super_admin") {
    return { errors: { role: ["Only a Super Admin can create Admin accounts"] } };
  }

  if (role === "stakeholder" && !client_id) {
    return { errors: { client_id: ["Client required for stakeholder accounts"] } };
  }

  const result = await createAccount(email, role, first_name, last_name, client_id || undefined);
  if (result.error) return { errors: { form: [result.error] } };

  await auditLog("user.account_created", caller.id, caller.email, {
    metadata: { target_user_id: result.userId, target_email: email, role },
  });

  revalidatePath("/admin/users");
  redirect(`/admin/users/${result.userId}?created=1`);
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
  client_id: z.string().uuid({ error: "Invalid organisation" }).optional().or(z.literal("")),
});

export type EditUserState = {
  saved?: boolean;
  errors?: {
    first_name?: string[];
    last_name?: string[];
    phone?: string[];
    company_role?: string[];
    state_territory?: string[];
    client_id?: string[];
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

const EditUserEmailSchema = z.object({
  email: z.string().email({ error: "Valid email required" }).trim().toLowerCase(),
});

export type EditUserEmailState = {
  saved?: boolean;
  errors?: {
    email?: string[];
  };
};

export async function updateUserEmail(
  userId: string,
  _prev: EditUserEmailState,
  formData: FormData
): Promise<EditUserEmailState> {
  const actor = await requireRole("super_admin", "admin");

  const validated = EditUserEmailSchema.safeParse({ email: formData.get("email") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email } = validated.data;
  const supabase = createAdminClient();

  const { data: current } = await supabase.from("users").select("email").eq("id", userId).single();
  if (!current) return { errors: { email: ["User not found."] } };

  const { error: authError } = await supabase.auth.admin.updateUserById(userId, {
    email,
    email_confirm: true,
  });
  if (authError) return { errors: { email: [authError.message] } };

  const { error } = await supabase.from("users").update({ email }).eq("id", userId);
  if (error) return { errors: { email: [error.message] } };

  await auditLog("user.email_updated", actor.id, actor.email, {
    metadata: { target_user_id: userId, previous_email: current.email, new_email: email },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");

  return { saved: true };
}

export async function updateUserProfile(
  userId: string,
  _prev: EditUserState,
  formData: FormData
): Promise<EditUserState> {
  const actor = await requireRole("super_admin", "admin");

  const supabase = createAdminClient();

  // Fields are edited one at a time, so the submission only carries the key
  // being changed — merge it over the current row before revalidating.
  const { data: current } = await supabase
    .from("users")
    .select("first_name, last_name, phone, company_role, state_territory, client_id")
    .eq("id", userId)
    .single();

  if (!current) return { errors: { form: ["User not found."] } };

  const validated = EditUserSchema.safeParse({
    first_name: formData.has("first_name") ? formData.get("first_name") : current.first_name,
    last_name: formData.has("last_name") ? formData.get("last_name") : current.last_name,
    phone: (formData.has("phone") ? formData.get("phone") : current.phone) || undefined,
    company_role:
      (formData.has("company_role") ? formData.get("company_role") : current.company_role) || undefined,
    state_territory: formData.has("state_territory")
      ? formData.get("state_territory")
      : current.state_territory,
    client_id: (formData.has("client_id") ? formData.get("client_id") : current.client_id) || undefined,
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { client_id, phone, company_role, ...rest } = validated.data;

  const { error } = await supabase
    .from("users")
    .update({
      ...rest,
      phone: phone || null,
      company_role: company_role || null,
      client_id: client_id || null,
    })
    .eq("id", userId);

  if (error) return { errors: { form: [error.message] } };

  await auditLog("user.profile_updated", actor.id, actor.email, {
    metadata: { target_user_id: userId },
  });

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  revalidatePath("/admin/consultants");

  return { saved: true };
}
