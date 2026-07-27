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

import { completeProfile, type CompleteProfileState } from "./auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

const VALID_FIELDS = {
  first_name: "Macky",
  last_name: "Jamal",
  phone: "0469299313",
  company_role: "Assistant",
  state_territory: "NSW",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("completeProfile", () => {
  it("does not require a password — the recovery-link flow already set one before this page is reachable", async () => {
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

    // No password/confirm_password in the submitted form at all.
    await expect(
      completeProfile({} as CompleteProfileState, makeFormData(VALID_FIELDS))
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/setup-2fa");
    // updateUser is only ever called to flip profile_complete — never with a password.
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({ data: { profile_complete: true } });
  });

  it("returns field errors for missing required profile fields", async () => {
    const result = await completeProfile({} as CompleteProfileState, makeFormData({}));

    expect(result.errors?.first_name).toBeDefined();
    expect(result.errors?.phone).toBeDefined();
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("errors when the session has expired", async () => {
    vi.mocked(createServerClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const result = await completeProfile({} as CompleteProfileState, makeFormData(VALID_FIELDS));

    expect(result.errors?.form).toContain("Session expired. Please log in again.");
  });
});
