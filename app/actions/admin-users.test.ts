import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/auth/session");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/auth/invite");

import { updateUserEmail, resetUserTotp, requireUserTotp, createUserAccount, updateConsultantDisciplines } from "./admin-users";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { createAccount } from "@/lib/auth/invite";

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

describe("createUserAccount — consultant disciplines required", () => {
  function form(fields: Record<string, string>) {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  }

  const base = { email: "new@ops.test", first_name: "New", last_name: "Consultant" };

  it("rejects a consultant account with no discipline selected", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);

    const res = await createUserAccount({}, form({ ...base, role: "consultant" }));

    expect(res.errors?.disciplines?.[0]).toMatch(/at least one discipline/i);
    expect(createAccount).not.toHaveBeenCalled();
  });

  it("rejects an invalid discipline letter even if one was checked", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    const fd = form({ ...base, role: "consultant" });
    fd.append("disciplines", "X");

    const res = await createUserAccount({}, fd);

    expect(res.errors?.disciplines?.[0]).toMatch(/isn't a discipline/);
  });

  it("creates a consultant with the selected disciplines", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    vi.mocked(createAccount).mockResolvedValue({ userId: "new-user-1" });
    const fd = form({ ...base, role: "consultant" });
    fd.append("disciplines", "f");
    fd.append("disciplines", "a");

    await createUserAccount({}, fd);

    expect(createAccount).toHaveBeenCalledWith("new@ops.test", "consultant", "New", "Consultant", undefined, ["F", "A"]);
  });

  it("does not require or pass disciplines for a stakeholder account", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    vi.mocked(createAccount).mockResolvedValue({ userId: "new-user-2" });

    await createUserAccount({}, form({ ...base, role: "stakeholder", client_id: "22222222-2222-4222-a222-222222222222" }));

    expect(createAccount).toHaveBeenCalledWith(
      "new@ops.test",
      "stakeholder",
      "New",
      "Consultant",
      "22222222-2222-4222-a222-222222222222",
      undefined
    );
  });
});

describe("updateConsultantDisciplines", () => {
  it("rejects an empty selection", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);

    const res = await updateConsultantDisciplines("user-1", {}, new FormData());

    expect(res.error).toMatch(/at least one discipline/i);
  });

  it("saves the new set and audits the change", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    const usersTable = singleTable({ role: "consultant", disciplines: ["S"] });
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ users: usersTable }) as never);
    const fd = new FormData();
    fd.append("disciplines", "f");

    const res = await updateConsultantDisciplines("user-1", {}, fd);

    expect(res).toEqual({ success: true });
    expect(usersTable.update).toHaveBeenCalledWith({ disciplines: ["F"] });
    expect(auditLog).toHaveBeenCalledWith(
      "user.disciplines_changed",
      "actor-1",
      "admin@ops.test",
      expect.objectContaining({ metadata: expect.objectContaining({ from: ["S"], to: ["F"] }) })
    );
  });

  it("reports a target that isn't a consultant as not found", async () => {
    vi.mocked(requireRole).mockResolvedValue(PLAIN_ADMIN as never);
    vi.mocked(createAdminClient).mockReturnValue(makeSupabase({ users: singleTable(null) }) as never);
    const fd = new FormData();
    fd.append("disciplines", "f");

    const res = await updateConsultantDisciplines("user-1", {}, fd);

    expect(res.error).toMatch(/not found/i);
  });
});
