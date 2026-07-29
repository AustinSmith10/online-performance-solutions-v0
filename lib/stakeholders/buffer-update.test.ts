import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/stakeholders/tokens", () => ({
  generateTokenString: vi.fn(() => "fresh-token"),
  computeTokenExpiry: vi.fn(async () => new Date("2026-08-01T00:00:00Z")),
}));
vi.mock("@/lib/email/sender", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));
vi.mock("@/lib/notifications/notify", () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/email/templates/StakeholderBufferUpdateEmail", () => ({
  renderStakeholderBufferUpdateEmail: vi.fn().mockReturnValue("<html></html>"),
}));

import { sendStakeholderBufferUpdate } from "./buffer-update";
import { sendEmail } from "@/lib/email/sender";
import { notify } from "@/lib/notifications/notify";

const PROJECT_ID = "11111111-2222-3333-4444-555555555555";

function chain(data: unknown) {
  const obj: Record<string, unknown> = {};
  const self = () => obj;
  obj.select = self;
  obj.eq = self;
  obj.in = self;
  obj.update = () => obj;
  obj.then = (fn: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(fn);
  return obj;
}

function buildSupabase(reviews: unknown[], admins: { id: string }[] = []) {
  const updateFn = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
  const from = vi.fn((table: string) => {
    if (table === "stakeholder_reviews") {
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: reviews, error: null }).then(fn), update: updateFn };
    }
    if (table === "users") return chain(admins);
    return chain(null);
  });
  return { from, updateFn };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendStakeholderBufferUpdate", () => {
  it("returns null when there are no reviews for the cycle", async () => {
    const supabase = buildSupabase([]);
    const result = await sendStakeholderBufferUpdate(supabase as never, PROJECT_ID, 1, "NSW", "[test]");
    expect(result).toBeNull();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("issues fresh tokens only to pending reviews, emails everyone", async () => {
    const reviews = [
      { id: "r-1", stakeholder_email: "pending@x.com", stakeholder_name: "Pending Person", status: "pending" },
      { id: "r-2", stakeholder_email: "approved@x.com", stakeholder_name: "Approved Person", status: "approved_without_comments" },
    ];
    const supabase = buildSupabase(reviews, [{ id: "admin-1" }]);

    const result = await sendStakeholderBufferUpdate(supabase as never, PROJECT_ID, 1, "NSW", "[test]");

    expect(result).toEqual({ total: 2, responded: 1, freshTokensIssued: 1 });
    expect(supabase.updateFn).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "pending@x.com" }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "approved@x.com" }));
  });

  it("notifies admins when someone is still non-responding", async () => {
    const reviews = [{ id: "r-1", stakeholder_email: "pending@x.com", stakeholder_name: "Pending Person", status: "pending" }];
    const supabase = buildSupabase(reviews, [{ id: "admin-1" }, { id: "admin-2" }]);

    await sendStakeholderBufferUpdate(supabase as never, PROJECT_ID, 1, "NSW", "[test]");

    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("skips the admin notify when everyone has responded", async () => {
    const reviews = [{ id: "r-1", stakeholder_email: "approved@x.com", stakeholder_name: "Approved Person", status: "approved_without_comments" }];
    const supabase = buildSupabase(reviews, [{ id: "admin-1" }]);

    const result = await sendStakeholderBufferUpdate(supabase as never, PROJECT_ID, 1, "NSW", "[test]");

    expect(result).toEqual({ total: 1, responded: 1, freshTokensIssued: 0 });
    expect(notify).not.toHaveBeenCalled();
  });
});
