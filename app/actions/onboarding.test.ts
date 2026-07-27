import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
  cookies: vi.fn().mockResolvedValue({ getAll: () => [], set: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/supabase/server");
vi.mock("@/lib/audit/log");

import {
  completeProfile,
  completeOnboarding,
  type CompleteProfileState,
  type CompleteOnboardingState,
} from "./auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const PROFILE_FIELDS = {
  phone: "0469299313",
  company_role: "Assistant",
  state_territory: "NSW",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("completeProfile (fallback path)", () => {
  it("does not ask for a password or name — a session already exists here, and the admin already set the name", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createServerClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }),
        updateUser,
      },
    } as never);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as never);

    await expect(
      completeProfile({} as CompleteProfileState, makeFormData(PROFILE_FIELDS))
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/setup-2fa");
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ data: { profile_complete: true } });
  });

  it("returns field errors for missing required profile fields", async () => {
    const result = await completeProfile({} as CompleteProfileState, makeFormData({}));

    expect(result.errors?.phone).toBeDefined();
    expect(result.errors?.state_territory).toBeDefined();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("errors when the session has expired", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const result = await completeProfile({} as CompleteProfileState, makeFormData(PROFILE_FIELDS));

    expect(result.errors?.form).toContain("Session expired. Please log in again.");
  });
});

describe("completeOnboarding (merged password + profile)", () => {
  function makeSupabase(userOverrides: Record<string, unknown> = { id: "user-1" }) {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: userOverrides } }),
        updateUser,
      },
      updateUser,
    };
  }

  it("sets the password and profile fields together, then redirects straight to 2FA setup", async () => {
    const supabaseMock = makeSupabase({ id: "user-1", email: "macky@example.com", app_metadata: { role: "stakeholder" } });
    vi.mocked(createServerClient).mockResolvedValue(supabaseMock as never);
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as never);
    const cookieSet = vi.fn();
    vi.mocked(cookies).mockResolvedValue({ getAll: () => [], set: cookieSet } as never);

    await expect(
      completeOnboarding(
        {} as CompleteOnboardingState,
        makeFormData({
          password: "Str0ng!Passw0rd",
          confirm_password: "Str0ng!Passw0rd",
          ...PROFILE_FIELDS,
        })
      )
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(supabaseMock.updateUser).toHaveBeenCalledWith({ password: "Str0ng!Passw0rd" });
    expect(supabaseMock.updateUser).toHaveBeenCalledWith({ data: { profile_complete: true } });
    // Without this, the user would look "session expired" on their very next
    // page load — this flow skips login(), which is normally what sets it.
    expect(cookieSet).toHaveBeenCalledWith(
      "ops-session-expires",
      expect.any(String),
      expect.any(Object)
    );
    expect(redirect).toHaveBeenCalledWith("/setup-2fa");
  });

  it("rejects mismatched passwords without calling Supabase", async () => {
    const result = await completeOnboarding(
      {} as CompleteOnboardingState,
      makeFormData({
        password: "Str0ng!Passw0rd",
        confirm_password: "Different1!Pass",
        ...PROFILE_FIELDS,
      })
    );

    expect(result.errors?.confirm_password).toBeDefined();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("requires the profile fields alongside the password", async () => {
    const result = await completeOnboarding(
      {} as CompleteOnboardingState,
      makeFormData({ password: "Str0ng!Passw0rd", confirm_password: "Str0ng!Passw0rd" })
    );

    expect(result.errors?.phone).toBeDefined();
    expect(result.errors?.state_territory).toBeDefined();
  });

  it("errors when the invite session is missing", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const result = await completeOnboarding(
      {} as CompleteOnboardingState,
      makeFormData({
        password: "Str0ng!Passw0rd",
        confirm_password: "Str0ng!Passw0rd",
        ...PROFILE_FIELDS,
      })
    );

    expect(result.errors?.form).toContain("Your invite link has expired. Ask an admin to resend it.");
  });
});
