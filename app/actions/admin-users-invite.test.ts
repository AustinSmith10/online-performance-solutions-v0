import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/auth/session");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/auth/invite");

import { resendInvite, resendInviteFailure, resolveEmailFailure } from "./admin-users";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";
import { sendWelcomeEmail } from "@/lib/auth/invite";

const ACTOR = { id: "actor-1", email: "admin@ops.test", role: "admin" };

function makeSupabase(tables: Record<string, unknown>) {
  return {
    from: vi.fn((table: string) => tables[table]),
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
  vi.mocked(requireRole).mockReset().mockResolvedValue(ACTOR as never);
  vi.mocked(auditLog).mockReset().mockResolvedValue(undefined);
  vi.mocked(sendWelcomeEmail).mockReset();
});

describe("resendInvite", () => {
  it("resends using the user's stored role and name", async () => {
    vi.mocked(sendWelcomeEmail).mockResolvedValue({});
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({
        users: singleTable({ email: "stakeholder@example.com", role: "stakeholder", first_name: "Macky" }),
      }) as never
    );

    const result = await resendInvite("user-1", {}, new FormData());

    expect(sendWelcomeEmail).toHaveBeenCalledWith(
      "stakeholder@example.com",
      "stakeholder",
      "Macky",
      "invite_resend"
    );
    expect(result.success).toBe(true);
  });

  it("surfaces the send error instead of pretending it succeeded", async () => {
    vi.mocked(sendWelcomeEmail).mockRejectedValue(new Error("not a Sender Signature"));
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({
        users: singleTable({ email: "a@b.com", role: "consultant", first_name: "Jon" }),
      }) as never
    );

    const result = await resendInvite("user-1", {}, new FormData());

    expect(result.error).toBe("not a Sender Signature");
  });

  it("errors when the user no longer exists", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ users: singleTable(null, { message: "not found" }) }) as never
    );

    const result = await resendInvite("missing", {}, new FormData());

    expect(result.error).toBe("User not found.");
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });
});

describe("resendInviteFailure", () => {
  it("refuses to resend a non-invite email source", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({
        email_send_log: singleTable({ to_email: "a@b.com", source: "stakeholder_dispatch_external" }),
      }) as never
    );

    const result = await resendInviteFailure("failure-1", {}, new FormData());

    expect(result.error).toBe("This email type can't be resent from here.");
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("errors when no user account matches the failed address", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({
        email_send_log: singleTable({ to_email: "a@b.com", source: "invite" }),
        users: singleTable(null, { message: "not found" }),
      }) as never
    );

    const result = await resendInviteFailure("failure-1", {}, new FormData());

    expect(result.error).toBe("No matching user account found for this address.");
  });

  it("resends and marks the failure resolved on success", async () => {
    vi.mocked(sendWelcomeEmail).mockResolvedValue({});
    const emailLogTable = singleTable({ to_email: "a@b.com", source: "invite" });
    const usersTable = singleTable({ id: "user-1", role: "stakeholder", first_name: "Macky" });
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ email_send_log: emailLogTable, users: usersTable }) as never
    );

    const result = await resendInviteFailure("failure-1", {}, new FormData());

    expect(result.success).toBe(true);
    expect(emailLogTable.update).toHaveBeenCalledWith(
      expect.objectContaining({ resolved_at: expect.any(String) })
    );
  });
});

describe("resolveEmailFailure", () => {
  it("marks the failure resolved", async () => {
    const emailLogTable = singleTable(null);
    vi.mocked(createAdminClient).mockReturnValue(
      makeSupabase({ email_send_log: emailLogTable }) as never
    );

    await resolveEmailFailure("failure-1");

    expect(emailLogTable.update).toHaveBeenCalledWith(
      expect.objectContaining({ resolved_at: expect.any(String) })
    );
    expect(emailLogTable.eq).toHaveBeenCalledWith("id", "failure-1");
  });
});
