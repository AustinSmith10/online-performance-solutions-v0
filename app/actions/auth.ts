"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SESSION_DURATION, SESSION_EXPIRY_COOKIE } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import type { UserRole } from "@/types";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const LoginSchema = z.object({
  email: z.string().email({ error: "Valid email required" }).trim().toLowerCase(),
  password: z.string().min(1, { error: "Password required" }),
});

const PasswordSchema = z
  .string()
  .min(12, { error: "Must be at least 12 characters" })
  .regex(/[A-Z]/, { error: "Must contain an uppercase letter" })
  .regex(/[0-9]/, { error: "Must contain a number" })
  .regex(/[^A-Za-z0-9]/, { error: "Must contain a special character" });

const CompleteProfileSchema = z
  .object({
    first_name: z.string().min(1, { error: "First name required" }).trim(),
    last_name: z.string().min(1, { error: "Last name required" }).trim(),
    phone: z.string().min(1, { error: "Phone required" }).trim(),
    company_role: z.string().min(1, { error: "Role required" }).trim(),
    state_territory: z.string().min(1, { error: "State/territory required" }),
    password: PasswordSchema,
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    error: "Passwords do not match",
    path: ["confirm_password"],
  });

const VerifyTotpSchema = z.object({
  code: z
    .string()
    .length(6, { error: "Code must be 6 digits" })
    .regex(/^\d+$/, { error: "Digits only" }),
});

// ─── Login ────────────────────────────────────────────────────────────────────

export type LoginState = {
  errors?: { email?: string[]; password?: string[]; form?: string[] };
};

export async function login(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const validated = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email, password } = validated.data;
  const supabase = await createClient();

  const { data: authData, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    // Increment failed login count (best effort — don't block on DB error)
    const adminClient = createAdminClient();
    const { data: userRow } = await adminClient
      .from("users")
      .select("id, failed_login_count, is_locked")
      .eq("email", email)
      .maybeSingle();

    if (userRow && !userRow.is_locked) {
      const newCount = userRow.failed_login_count + 1;
      await adminClient
        .from("users")
        .update({ failed_login_count: newCount, is_locked: newCount >= 15 })
        .eq("id", userRow.id);

      if (newCount >= 15) {
        return {
          errors: {
            form: ["Account locked after repeated failed attempts. Contact your administrator."],
          },
        };
      }
    }

    if (userRow?.is_locked) {
      return {
        errors: {
          form: ["Your account is locked. Contact your administrator to regain access."],
        },
      };
    }

    return { errors: { form: ["Invalid email or password"] } };
  }

  // Check if account is locked
  const adminClient = createAdminClient();
  const { data: userRow } = await adminClient
    .from("users")
    .select("id, is_locked, role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (userRow?.is_locked) {
    await supabase.auth.signOut();
    return {
      errors: {
        form: ["Your account is locked. Contact your administrator to regain access."],
      },
    };
  }

  // Reset failed login count on success
  if (userRow) {
    await adminClient
      .from("users")
      .update({ failed_login_count: 0 })
      .eq("id", userRow.id);
  }

  // Set role-based session expiry cookie
  const role = (userRow?.role ?? "client") as UserRole;
  const durationMs = SESSION_DURATION[role];
  const expiresAt = Date.now() + durationMs;
  const cookieStore = await cookies();
  cookieStore.set(SESSION_EXPIRY_COOKIE, String(expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: durationMs / 1000,
  });

  await auditLog("auth.login", authData.user.id, authData.user.email ?? email, {
    metadata: { role },
  });

  const next = formData.get("next") as string | null;
  redirect(next || "/");
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_EXPIRY_COOKIE);
  redirect("/login");
}

// ─── Complete profile ─────────────────────────────────────────────────────────

export type CompleteProfileState = {
  errors?: {
    first_name?: string[];
    last_name?: string[];
    phone?: string[];
    company_role?: string[];
    state_territory?: string[];
    password?: string[];
    confirm_password?: string[];
    form?: string[];
  };
};

export async function completeProfile(
  _prev: CompleteProfileState,
  formData: FormData
): Promise<CompleteProfileState> {
  const validated = CompleteProfileSchema.safeParse({
    first_name: formData.get("first_name"),
    last_name: formData.get("last_name"),
    phone: formData.get("phone"),
    company_role: formData.get("company_role"),
    state_territory: formData.get("state_territory"),
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { errors: { form: ["Session expired. Please log in again."] } };

  const { first_name, last_name, phone, company_role, state_territory, password } =
    validated.data;

  // Set password
  const { error: pwError } = await supabase.auth.updateUser({ password });
  if (pwError) return { errors: { form: [pwError.message] } };

  // Mark profile complete in auth user_metadata
  const { error: metaError } = await supabase.auth.updateUser({
    data: { profile_complete: true },
  });
  if (metaError) return { errors: { form: [metaError.message] } };

  // Update users table
  const adminClient = createAdminClient();
  const { error: dbError } = await adminClient
    .from("users")
    .update({ first_name, last_name, phone, company_role, state_territory, profile_complete: true })
    .eq("id", user.id);
  if (dbError) return { errors: { form: [dbError.message] } };

  redirect("/setup-2fa");
}

// ─── TOTP verification (login step 2) ────────────────────────────────────────

export type VerifyTotpState = {
  errors?: { code?: string[]; form?: string[] };
};

export async function verifyTotp(
  _prev: VerifyTotpState,
  formData: FormData
): Promise<VerifyTotpState> {
  const validated = VerifyTotpSchema.safeParse({ code: formData.get("code") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();

  // Get the enrolled TOTP factor
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totpFactor = factors?.totp?.[0];
  if (!totpFactor) {
    return { errors: { form: ["No TOTP factor found. Please set up 2FA."] } };
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId: totpFactor.id,
    code: validated.data.code,
  });

  if (error) {
    return { errors: { form: ["Invalid code. Please try again."] } };
  }

  const next = formData.get("next") as string | null;
  redirect(next || "/");
}

// ─── TOTP enrollment confirmation ─────────────────────────────────────────────

export type ConfirmTotpState = {
  errors?: { code?: string[]; form?: string[] };
  factorId?: string;
};

export async function confirmTotpEnrollment(
  _prev: ConfirmTotpState,
  formData: FormData
): Promise<ConfirmTotpState> {
  const validated = VerifyTotpSchema.safeParse({ code: formData.get("code") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const factorId = formData.get("factor_id") as string | null;
  if (!factorId) {
    return { errors: { form: ["Enrollment session lost. Please refresh and try again."] } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: validated.data.code,
  });

  if (error) {
    return { errors: { form: ["Invalid code. Scan the QR code again and retry."] } };
  }

  // Mark TOTP as enabled in the users table
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const adminClient = createAdminClient();
    await adminClient.from("users").update({ totp_enabled: true }).eq("id", user.id);
  }

  redirect("/");
}
