import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveStakeholders } = vi.hoisted(() => ({ mockResolveStakeholders: vi.fn() }));
vi.mock("@/lib/stakeholders/resolver", () => ({ resolveStakeholders: mockResolveStakeholders }));

import { isReplySenderVerified } from "./sender-verification";

function clientWithSubmitter(email: string | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: email ? { email } : null, error: null }),
    }),
  } as never;
}

const BASE = {
  reviewStakeholderEmail: "Reviewer@Firm.com",
  projectId: "proj-1",
  templateId: "tpl-1",
  submittedBy: "user-1",
};

describe("isReplySenderVerified", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveStakeholders.mockResolvedValue([{ id: "s1", name: "Ann", email: "ann@firm.com", company: null }]);
  });

  it("accepts the review's own stakeholder, ignoring case", async () => {
    expect(await isReplySenderVerified(clientWithSubmitter(null), { ...BASE, fromEmail: "reviewer@firm.com" })).toBe(true);
  });

  it("accepts anyone on the project's reviewer roster", async () => {
    expect(await isReplySenderVerified(clientWithSubmitter(null), { ...BASE, fromEmail: "ANN@firm.com" })).toBe(true);
  });

  it("accepts the project's submitter", async () => {
    expect(await isReplySenderVerified(clientWithSubmitter("owner@client.com"), { ...BASE, fromEmail: "owner@client.com" })).toBe(true);
  });

  it("rejects an address that is none of those", async () => {
    expect(await isReplySenderVerified(clientWithSubmitter("owner@client.com"), { ...BASE, fromEmail: "stranger@elsewhere.com" })).toBe(false);
  });

  it("skips the submitter lookup when the project has none", async () => {
    const client = clientWithSubmitter("owner@client.com");
    await isReplySenderVerified(client, { ...BASE, submittedBy: null, fromEmail: "stranger@elsewhere.com" });
    expect((client as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
});
