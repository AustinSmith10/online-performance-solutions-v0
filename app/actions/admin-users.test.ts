import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/auth/session");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/auth/invite");

import { updateUserEmail, resetUserTotp, requireUserTotp } from "./admin-users";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";

const PLAIN_ADMIN = { id: "actor-1", email: "admin@ops.test", role: "admin" };
const SUPER_ADMIN = { id: "actor-2", email: "super@ops.test", role: "super_admin" };

function makeSupabase(tables: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => tables[table]),
    auth: {
      admin: {
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
        mfa: {
          listFactors: vi.fn().mockResolvedValue({ data: { factors: [] } }),
          deleteFactor: vi.fn().mockResolvedValue({ error: null }),
        },
      },
    },
  };
}

function singleTable(row: Record<string, unknown> | null, error: unknown = null) {
  return {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: row, error }),
    maybeSingle: vi.fn().mockResolvedValue({ data: row, error }),
  };
}

beforeEach(() => {
  vi.mocked(requireRole).mockReset();
  vi.mocked(auditLog).mockReset().mockResolvedValue(undefined);
});

describe("updateUserEmail", () => {
  function formDataWith(email: string) {
    const fd = new FormData();
    fd.set("email", email);
    return fd;
  }

  it("blocks a plain admin from editing a super_admin's email", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({
        users: singleTable({ email: "old@example.com", role: "super_admin" }),
      }) as never
    );

    const result = await updateUserEmail("user-1", {}, formDataWith("new@example.com"));

    expect(result.errors?.email).toEqual(["Insufficient permissions to edit this account."]);
  });

  it("blocks a plain admin from editing another admin's email", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({
        users: singleTable({ email: "old@example.com", role: "admin" }),
      }) as never
    );

    const result = await updateUserEmail("user-1", {}, formDataWith("new@example.com"));

    expect(result.errors?.email).toEqual(["Insufficient permissions to edit this account."]);
  });

  it("allows a plain admin to edit a consultant's email", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    const usersTable = singleTable({ email: "old@example.com", role: "consultant" });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ users: usersTable }) as never);

    const result = await updateUserEmail("user-1", {}, formDataWith("new@example.com"));

    expect(result.saved).toBe(true);
  });

  it("allows a plain admin to edit a stakeholder's email", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    const usersTable = singleTable({ email: "old@example.com", role: "stakeholder" });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ users: usersTable }) as never);

    const result = await updateUserEmail("user-1", {}, formDataWith("new@example.com"));

    expect(result.saved).toBe(true);
  });

  it("allows a super_admin to edit another super_admin's email", async () => {
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as never);
    const usersTable = singleTable({ email: "old@example.com", role: "super_admin" });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ users: usersTable }) as never);

    const result = await updateUserEmail("user-1", {}, formDataWith("new@example.com"));

    expect(result.saved).toBe(true);
  });
});

describe("resetUserTotp", () => {
  it("blocks a plain admin from resetting a super_admin's TOTP", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ users: singleTable({ role: "super_admin" }) }) as never
    );

    await expect(resetUserTotp("user-1")).rejects.toThrow("Insufficient permissions.");
  });

  it("blocks a plain admin from resetting another admin's TOTP", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ users: singleTable({ role: "admin" }) }) as never
    );

    await expect(resetUserTotp("user-1")).rejects.toThrow("Insufficient permissions.");
  });

  it("allows a plain admin to reset a consultant's TOTP", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    const usersTable = singleTable({ role: "consultant" });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ users: usersTable }) as never);

    await expect(resetUserTotp("user-1")).resolves.toBeUndefined();
  });

  it("allows a super_admin to reset another super_admin's TOTP", async () => {
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as never);
    const usersTable = singleTable({ role: "super_admin" });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ users: usersTable }) as never);

    await expect(resetUserTotp("user-1")).resolves.toBeUndefined();
  });
});

describe("requireUserTotp", () => {
  it("blocks a plain admin from requiring TOTP for a super_admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ users: singleTable({ role: "super_admin" }) }) as never
    );

    await expect(requireUserTotp("user-1")).rejects.toThrow("Insufficient permissions.");
  });

  it("blocks a plain admin from requiring TOTP for another admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ users: singleTable({ role: "admin" }) }) as never
    );

    await expect(requireUserTotp("user-1")).rejects.toThrow("Insufficient permissions.");
  });

  it("allows a plain admin to require TOTP for a stakeholder", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    const usersTable = singleTable({ role: "stakeholder" });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ users: usersTable }) as never);

    await expect(requireUserTotp("user-1")).resolves.toBeUndefined();
  });

  it("allows a super_admin to require TOTP for another admin", async () => {
    vi.mocked(requireRole).mockResolvedValue(SUPER_ADMIN as never);
    const usersTable = singleTable({ role: "admin" });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ users: usersTable }) as never);

    await expect(requireUserTotp("user-1")).resolves.toBeUndefined();
  });
});
