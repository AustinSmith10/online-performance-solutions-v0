import { describe, it, expect, vi } from "vitest";
import { getFailedInviteEmails } from "./invite-status";

function makeSupabase(rows: { to_email: string; status: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }),
  };
}

describe("getFailedInviteEmails", () => {
  it("returns an empty set without querying when there are no emails", async () => {
    const supabase = makeSupabase([]);
    const result = await getFailedInviteEmails(supabase as never, []);
    expect(result.size).toBe(0);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("flags an address whose latest attempt failed", async () => {
    const supabase = makeSupabase([{ to_email: "a@b.com", status: "failed" }]);
    const result = await getFailedInviteEmails(supabase as never, ["a@b.com"]);
    expect(result.has("a@b.com")).toBe(true);
  });

  it("clears a failure once a later resend succeeded", async () => {
    // rows come back ordered ascending by created_at — later rows overwrite earlier ones
    const supabase = makeSupabase([
      { to_email: "a@b.com", status: "failed" },
      { to_email: "a@b.com", status: "sent" },
    ]);
    const result = await getFailedInviteEmails(supabase as never, ["a@b.com"]);
    expect(result.has("a@b.com")).toBe(false);
  });

  it("ignores addresses that never had an invite attempt", async () => {
    const supabase = makeSupabase([]);
    const result = await getFailedInviteEmails(supabase as never, ["nobody@example.com"]);
    expect(result.size).toBe(0);
  });
});
