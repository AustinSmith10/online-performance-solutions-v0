"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { sendInvite } from "@/lib/auth/invite";
import { auditLog } from "@/lib/audit/log";
import type { ConsultantAvailability } from "@/types";

const InviteSchema = z.object({
  email: z.string().email({ error: "Valid email required" }).trim().toLowerCase(),
  role: z.enum(["client", "consultant"], { error: "Invalid role" }),
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
  await requireRole("super_admin");

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

  if (role === "client" && !org_id) {
    return { errors: { org_id: ["Organisation required for client users"] } };
  }

  const result = await sendInvite(email, role, org_id || undefined);
  if (result.error) return { errors: { form: [result.error] } };

  revalidatePath("/admin/users");
  redirect(`/admin/users/${result.userId}`);
}

export async function unlockUser(userId: string) {
  await requireRole("super_admin");

  const supabase = createAdminClient();
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
  await requireRole("super_admin");

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
  const actor = await requireRole("super_admin");

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
  const actor = await requireRole("super_admin");

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
  await requireRole("super_admin");

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
