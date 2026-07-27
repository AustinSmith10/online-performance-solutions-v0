"use server";

import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
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

// No name fields here — the admin sets first/last name (and the account's
// system role) at creation, so re-asking would just duplicate data that
// already exists. "company_role" below is a free-text job title (e.g.
// "Property Manager"), unrelated to the system role and not set anywhere
// else, so it's still collected.
const ProfileFieldsSchema = {
  phone: z.string().min(1, { error: "Phone required" }).trim(),
  company_role: z.string().min(1, { error: "Role required" }).trim(),
  state_territory: z.string().min(1, { error: "State/territory required" }),
};

// Fallback path for a session that reaches an authenticated, profile-
// incomplete state without going through the merged onboarding form below
// (e.g. /auth/confirm). No password field — by definition a session already
// exists here, so a password is already set.
const CompleteProfileSchema = z.object(ProfileFieldsSchema);

// The normal invite path: password + profile fields collected together in
// one form on /auth/update-password, instead of a password step followed by
// a separate "complete your profile" page — found redundant during manual
// invite-flow QA.
const CompleteOnboardingSchema = z
  .object({
    password: PasswordSchema,
    confirm_password: z.string(),
    ...ProfileFieldsSchema,
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roleHomePath(role: string): string {
  if (role === "super_admin" || role === "admin") return "/admin/dashboard";
  if (role === "consultant") return "/ops";
  return "/portal";
}

// ─── Login ────────────────────────────────────────────────────────────────────

export type LoginState = {
  errors?: { email?: string[]; password?: string[]; form?: string[] };
  locked?: boolean;
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
    // Increment failed login count atomically (best effort — don't block on DB error)
    const adminClient = createAdminClient();
    const { data: recordResult } = await adminClient
      .rpc("record_failed_login", { p_email: email })
      .single();
    const record = recordResult as
      | { status: string; user_id: string | null; new_count: number | null; locked: boolean | null }
      | null;

    if (record?.status === "ok" && record.locked) {
      return {
        errors: {
          form: ["Account locked after repeated failed attempts."],
        },
        locked: true,
      };
    }

    if (record?.status === "already_locked") {
      return {
        errors: {
          form: ["Your account is locked."],
        },
        locked: true,
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
        form: ["Your account is locked."],
      },
      locked: true,
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
  const role = (userRow?.role ?? "stakeholder") as UserRole;
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
  redirect(next || roleHomePath(role));
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_EXPIRY_COOKIE);
  redirect("/login");
}

// ─── Forgot password (self-serve) ──────────────────────────────────────────────

const ForgotPasswordSchema = z.object({
  email: z.string().email({ error: "Valid email required" }).trim().toLowerCase(),
});

// Always returned regardless of whether the email matches an account, so the
// response can't be used to enumerate registered users.
const RESET_REQUEST_NEUTRAL_MESSAGE =
  "If an account exists for that email, we've sent a password reset link.";

const RESET_EMAIL_WINDOW_MINUTES = 15;
const RESET_EMAIL_MAX_ATTEMPTS = 3;
const RESET_IP_WINDOW_MINUTES = 60;
const RESET_IP_MAX_ATTEMPTS = 10;

export type ForgotPasswordState = {
  message?: string;
  errors?: { email?: string[]; form?: string[] };
};

export async function requestPasswordReset(
  _prev: ForgotPasswordState,
  formData: FormData
): Promise<ForgotPasswordState> {
  const validated = ForgotPasswordSchema.safeParse({
    email: formData.get("email"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { email } = validated.data;
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const adminClient = createAdminClient();
  const windowStart = (minutes: number) =>
    new Date(Date.now() - minutes * 60 * 1000).toISOString();

  const [emailAttempts, ipAttempts] = await Promise.all([
    adminClient
      .from("password_reset_attempts")
      .select("id", { count: "exact", head: true })
      .eq("email", email)
      .gte("created_at", windowStart(RESET_EMAIL_WINDOW_MINUTES)),
    ip
      ? adminClient
          .from("password_reset_attempts")
          .select("id", { count: "exact", head: true })
          .eq("ip", ip)
          .gte("created_at", windowStart(RESET_IP_WINDOW_MINUTES))
      : Promise.resolve({ count: 0 }),
  ]);

  await adminClient.from("password_reset_attempts").insert({ email, ip });

  const rateLimited =
    (emailAttempts.count ?? 0) >= RESET_EMAIL_MAX_ATTEMPTS ||
    (ipAttempts.count ?? 0) >= RESET_IP_MAX_ATTEMPTS;

  if (rateLimited) {
    await auditLog("auth.password_reset_rate_limited", null, email, { metadata: { ip } });
    return { message: RESET_REQUEST_NEUTRAL_MESSAGE };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password`,
  });

  await auditLog("auth.password_reset_requested", null, email, { metadata: { ip } });

  return { message: RESET_REQUEST_NEUTRAL_MESSAGE };
}

// ─── Complete password reset (recovery-link landing page) ─────────────────────

const CompletePasswordResetSchema = z
  .object({
    password: PasswordSchema,
    confirm_password: z.string(),
  })
  .refine((d) => d.password === d.confirm_password, {
    error: "Passwords do not match",
    path: ["confirm_password"],
  });

export type CompletePasswordResetState = {
  success?: boolean;
  errors?: { password?: string[]; confirm_password?: string[]; form?: string[] };
};

export async function completePasswordReset(
  _prev: CompletePasswordResetState,
  formData: FormData
): Promise<CompletePasswordResetState> {
  const validated = CompletePasswordResetSchema.safeParse({
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { errors: { form: ["Your reset link has expired. Please request a new one."] } };
  }

  const { error } = await supabase.auth.updateUser({ password: validated.data.password });
  if (error) return { errors: { form: [error.message] } };

  await auditLog("auth.password_reset_completed", user.id, user.email ?? null, {});

  return { success: true };
}

// ─── Complete profile (fallback — see CompleteProfileSchema above) ────────────

export type CompleteProfileState = {
  errors?: {
    phone?: string[];
    company_role?: string[];
    state_territory?: string[];
    form?: string[];
  };
};

export async function completeProfile(
  _prev: CompleteProfileState,
  formData: FormData
): Promise<CompleteProfileState> {
  const validated = CompleteProfileSchema.safeParse({
    phone: formData.get("phone"),
    company_role: formData.get("company_role"),
    state_territory: formData.get("state_territory"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { errors: { form: ["Session expired. Please log in again."] } };

  const { phone, company_role, state_territory } = validated.data;

  // Mark profile complete in auth user_metadata
  const { error: metaError } = await supabase.auth.updateUser({
    data: { profile_complete: true },
  });
  if (metaError) return { errors: { form: [metaError.message] } };

  // Update users table
  const adminClient = createAdminClient();
  const { error: dbError } = await adminClient
    .from("users")
    .update({ phone, company_role, state_territory, profile_complete: true })
    .eq("id", user.id);
  if (dbError) return { errors: { form: [dbError.message] } };

  redirect("/setup-2fa");
}

// ─── Complete onboarding (password + profile, merged into one form) ───────────

export type CompleteOnboardingState = {
  errors?: {
    password?: string[];
    confirm_password?: string[];
    phone?: string[];
    company_role?: string[];
    state_territory?: string[];
    form?: string[];
  };
};

export async function completeOnboarding(
  _prev: CompleteOnboardingState,
  formData: FormData
): Promise<CompleteOnboardingState> {
  const validated = CompleteOnboardingSchema.safeParse({
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
    phone: formData.get("phone"),
    company_role: formData.get("company_role"),
    state_territory: formData.get("state_territory"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { errors: { form: ["Your invite link has expired. Ask an admin to resend it."] } };
  }

  const { password, phone, company_role, state_territory } = validated.data;

  const { error: pwError } = await supabase.auth.updateUser({ password });
  if (pwError) return { errors: { form: [pwError.message] } };

  const { error: metaError } = await supabase.auth.updateUser({
    data: { profile_complete: true },
  });
  if (metaError) return { errors: { form: [metaError.message] } };

  const adminClient = createAdminClient();
  const { error: dbError } = await adminClient
    .from("users")
    .update({ phone, company_role, state_territory, profile_complete: true })
    .eq("id", user.id);
  if (dbError) return { errors: { form: [dbError.message] } };

  // This flow never goes through login() (that's the whole point — the old
  // update-password → login → complete-profile bounce was the redundant
  // part), so the session-expiry cookie login() normally sets is missing
  // here. Without it, the very first post-onboarding page load would look
  // "expired" and bounce the user straight to signout.
  const role = (user.app_metadata?.role ?? "stakeholder") as UserRole;
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

  await auditLog("auth.onboarding_completed", user.id, user.email ?? null, {});

  redirect("/setup-2fa");
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

  // Mark TOTP as enabled in the users table and fetch role for redirect
  const { data: { user } } = await supabase.auth.getUser();
  let userRole = "stakeholder";
  if (user) {
    const adminClient = createAdminClient();
    const [, roleRow] = await Promise.all([
      adminClient.from("users").update({ totp_enabled: true }).eq("id", user.id),
      adminClient.from("users").select("role").eq("id", user.id).maybeSingle(),
    ]);
    userRole = (roleRow.data?.role as string | null) ?? "stakeholder";
  }

  redirect(roleHomePath(userRole));
}
