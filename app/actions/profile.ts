"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/session";

// Australian phone: 10 digits starting with 0[2-9], or +61[2-9] + 8 digits
const AU_PHONE_RE = /^(?:\+61|0)[2-9]\d{8}$/;

const ProfileSchema = z.object({
  first_name: z.string().min(1, { error: "Required" }).trim(),
  last_name: z.string().min(1, { error: "Required" }).trim(),
  phone: z
    .string()
    .min(1, { error: "Required" })
    .transform((v) => v.replace(/[\s()\-]/g, ""))
    .refine((v) => AU_PHONE_RE.test(v), {
      error: "Enter a valid Australian phone number (e.g. 0412 345 678)",
    }),
  company_role: z.string().min(1, { error: "Required" }).trim(),
  state_territory: z.enum(["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"], {
    error: "Select a state or territory",
  }),
});

export type UpdateProfileState = {
  saved?: boolean;
  errors?: {
    first_name?: string[];
    last_name?: string[];
    phone?: string[];
    company_role?: string[];
    state_territory?: string[];
    form?: string[];
  };
};

export async function updateProfile(
  _prev: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: ["Session expired. Please log in again."] } };

  const validated = ProfileSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    phone: formData.get("phone"),
    company_role: formData.get("company_role"),
    state_territory: formData.get("state_territory"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update(validated.data)
    .eq("id", user.id as string);

  if (error) return { errors: { form: [error.message] } };

  return { saved: true };
}

// ─── Password change ──────────────────────────────────────────────────────────

const NewPasswordSchema = z
  .string()
  .min(12, { error: "Must be at least 12 characters" })
  .regex(/[A-Z]/, { error: "Must contain an uppercase letter" })
  .regex(/[0-9]/, { error: "Must contain a number" })
  .regex(/[^A-Za-z0-9]/, { error: "Must contain a special character" });

const ChangePasswordSchema = z
  .object({
    current_password: z.string().min(1, { error: "Current password is required" }),
    new_password: NewPasswordSchema,
    confirm_password: z.string().min(1, { error: "Required" }),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    error: "Passwords do not match",
    path: ["confirm_password"],
  });

export type ChangePasswordState = {
  saved?: boolean;
  errors?: {
    current_password?: string[];
    new_password?: string[];
    confirm_password?: string[];
    form?: string[];
  };
};

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData
): Promise<ChangePasswordState> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: ["Session expired. Please log in again."] } };

  const validated = ChangePasswordSchema.safeParse({
    current_password: formData.get("current_password"),
    new_password: formData.get("new_password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { current_password, new_password } = validated.data;

  // Verify current password by re-authenticating
  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email as string,
    password: current_password,
  });

  if (signInError) {
    return { errors: { current_password: ["Current password is incorrect"] } };
  }

  // Update to new password
  const { error: updateError } = await supabase.auth.updateUser({ password: new_password });
  if (updateError) return { errors: { form: [updateError.message] } };

  return { saved: true };
}

// ─── Revoke remembered devices ────────────────────────────────────────────────

export type RevokeTrustedDevicesState = {
  saved?: boolean;
  errors?: { form?: string[] };
};

export async function revokeTrustedDevices(
  _prev: RevokeTrustedDevicesState,
  _formData: FormData
): Promise<RevokeTrustedDevicesState> {
  const user = await getSessionUser();
  if (!user) return { errors: { form: ["Session expired. Please log in again."] } };

  const supabase = createAdminClient();
  const { error } = await supabase.rpc("increment_trusted_device_version", {
    p_user_id: user.id as string,
  });

  if (error) return { errors: { form: [error.message] } };

  return { saved: true };
}
