import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/supabase/server");
vi.mock("@/lib/audit/log");

import {
  requestPasswordReset,
  completePasswordReset,
  type ForgotPasswordState,
  type CompletePasswordResetState,
} from "./auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit/log";
import { headers } from "next/headers";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

function buildAdminMock({ emailCount = 0, ipCount = 0 } = {}) {
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  const from = vi.fn((table: string) => {
    if (table !== "password_reset_attempts") throw new Error(`unexpected table ${table}`);
    return {
      select: vi.fn(() => ({
        eq: vi.fn((col: string) => ({
          gte: vi.fn().mockResolvedValue({
            count: col === "email" ? emailCount : ipCount,
            error: null,
          }),
        })),
      })),
      insert,
    };
  });
  return { from, insert };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(headers).mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.4" }));
});

// ─── requestPasswordReset ───────────────────────────────────────────────────────

describe("requestPasswordReset — input validation", () => {
  it("returns a field error for an invalid email", async () => {
    const result = await requestPasswordReset(
      {} as ForgotPasswordState,
      makeFormData({ email: "not-an-email" })
    );
    expect(result.errors?.email).toBeDefined();
    expect(result.message).toBeUndefined();
  });
});

describe("requestPasswordReset — happy path", () => {
  it("triggers a Supabase recovery email and returns the neutral message", async () => {
    const adminMock = buildAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(adminMock as never);

    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { resetPasswordForEmail },
    } as never);

    const result = await requestPasswordReset(
      {} as ForgotPasswordState,
      makeFormData({ email: "Jane@Example.com" })
    );

    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      "jane@example.com",
      expect.objectContaining({ redirectTo: expect.stringContaining("/auth/update-password") })
    );
    expect(adminMock.insert).toHaveBeenCalledWith(
      expect.objectContaining({ email: "jane@example.com", ip: "203.0.113.4" })
    );
    expect(auditLog).toHaveBeenCalledWith(
      "auth.password_reset_requested",
      null,
      "jane@example.com",
      expect.anything()
    );
    expect(result.message).toMatch(/if an account exists/i);
  });

  it("returns the same neutral message for an email with no matching account", async () => {
    const adminMock = buildAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(adminMock as never);

    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { resetPasswordForEmail },
    } as never);

    const result = await requestPasswordReset(
      {} as ForgotPasswordState,
      makeFormData({ email: "nobody@example.com" })
    );

    // Supabase is still called — it's Supabase's own responsibility not to leak
    // whether the account exists — and the app-level response is identical either way.
    expect(resetPasswordForEmail).toHaveBeenCalled();
    expect(result.message).toMatch(/if an account exists/i);
    expect(result.errors).toBeUndefined();
  });
});

describe("requestPasswordReset — rate limiting", () => {
  it("skips sending the email once the per-email window is exceeded, but still returns the neutral message", async () => {
    const adminMock = buildAdminMock({ emailCount: 3 });
    vi.mocked(createAdminClient).mockReturnValue(adminMock as never);

    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { resetPasswordForEmail },
    } as never);

    const result = await requestPasswordReset(
      {} as ForgotPasswordState,
      makeFormData({ email: "hammered@example.com" })
    );

    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(
      "auth.password_reset_rate_limited",
      null,
      "hammered@example.com",
      expect.anything()
    );
    expect(result.message).toMatch(/if an account exists/i);
  });

  it("skips sending the email once the per-IP window is exceeded", async () => {
    const adminMock = buildAdminMock({ ipCount: 10 });
    vi.mocked(createAdminClient).mockReturnValue(adminMock as never);

    const resetPasswordForEmail = vi.fn().mockResolvedValue({ data: {}, error: null });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { resetPasswordForEmail },
    } as never);

    const result = await requestPasswordReset(
      {} as ForgotPasswordState,
      makeFormData({ email: "another@example.com" })
    );

    expect(resetPasswordForEmail).not.toHaveBeenCalled();
    expect(result.message).toMatch(/if an account exists/i);
  });
});

// ─── completePasswordReset ─────────────────────────────────────────────────────

describe("completePasswordReset — input validation", () => {
  it("returns a field error when the password is too weak", async () => {
    const result = await completePasswordReset(
      {} as CompletePasswordResetState,
      makeFormData({ password: "short", confirm_password: "short" })
    );
    expect(result.errors?.password).toBeDefined();
  });

  it("returns a field error when passwords don't match", async () => {
    const result = await completePasswordReset(
      {} as CompletePasswordResetState,
      makeFormData({ password: "Str0ng!Passw0rd", confirm_password: "Different1!" })
    );
    expect(result.errors?.confirm_password).toBeDefined();
  });
});

describe("completePasswordReset — session handling", () => {
  it("errors out when there is no recovered session", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const result = await completePasswordReset(
      {} as CompletePasswordResetState,
      makeFormData({ password: "Str0ng!Passw0rd", confirm_password: "Str0ng!Passw0rd" })
    );

    expect(result.errors?.form?.[0]).toMatch(/expired/i);
  });

  it("updates the password and audit-logs completion on success", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user-1", email: "jane@example.com" } } }),
        updateUser,
      },
    } as never);

    const result = await completePasswordReset(
      {} as CompletePasswordResetState,
      makeFormData({ password: "Str0ng!Passw0rd", confirm_password: "Str0ng!Passw0rd" })
    );

    expect(updateUser).toHaveBeenCalledWith({ password: "Str0ng!Passw0rd" });
    expect(auditLog).toHaveBeenCalledWith(
      "auth.password_reset_completed",
      "user-1",
      "jane@example.com",
      {}
    );
    expect(result.success).toBe(true);
  });
});
