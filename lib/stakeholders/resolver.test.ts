import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");

import { resolveStakeholders } from "./resolver";
import { createAdminClient } from "@/lib/supabase/admin";

const TEMPLATE_REQUIRED_ROWS = [
  { stakeholders: { id: "ts-1", name: "Certifier", email: "certifier@example.com", company: "Acme", is_active: true, deleted_at: null } },
  { stakeholders: { id: "ts-2", name: "Inactive Contact", email: "inactive@example.com", company: null, is_active: false, deleted_at: null } },
];

const PROJECT_EXTRAS = [
  { id: "ps-1", name: "One-off Contact", email: "oneoff@example.com", company: null },
];

function buildMock(templateRows: unknown[], projectRows: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: projectRows, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      resolve({ data: templateRows, error: null }),
  };
  const from = vi.fn().mockImplementation((table: string) => {
    if (table === "template_stakeholders") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: templateRows, error: null }),
      };
    }
    return chain;
  });
  return { from };
}

describe("resolveStakeholders", () => {
  it("returns the template's required reviewers", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock(TEMPLATE_REQUIRED_ROWS, []) as never);
    const result = await resolveStakeholders("proj-1", "template-1");
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("certifier@example.com");
  });

  it("excludes inactive/deleted template-required stakeholders", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock(TEMPLATE_REQUIRED_ROWS, []) as never);
    const result = await resolveStakeholders("proj-1", "template-1");
    const emails = result.map((s) => s.email);
    expect(emails).not.toContain("inactive@example.com");
  });

  it("adds project-scope extras on top of template-required reviewers", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock(TEMPLATE_REQUIRED_ROWS, PROJECT_EXTRAS) as never);
    const result = await resolveStakeholders("proj-1", "template-1");
    const emails = result.map((s) => s.email);
    expect(emails).toContain("certifier@example.com");
    expect(emails).toContain("oneoff@example.com");
  });

  it("dedupes a project extra that matches a template-required email", async () => {
    const dupeExtra = [{ id: "ps-2", name: "Dupe", email: "certifier@example.com", company: null }];
    vi.mocked(createAdminClient).mockReturnValue(buildMock(TEMPLATE_REQUIRED_ROWS, dupeExtra) as never);
    const result = await resolveStakeholders("proj-1", "template-1");
    expect(result).toHaveLength(1);
  });

  it("returns an empty array when there is no template and no project extras", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock([], []) as never);
    const result = await resolveStakeholders("proj-1", null);
    expect(result).toHaveLength(0);
  });

  it("returns name, email, and company from project extras", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock([], PROJECT_EXTRAS) as never);
    const result = await resolveStakeholders("proj-1", null);
    expect(result[0]).toMatchObject({
      name: "One-off Contact",
      email: "oneoff@example.com",
      company: null,
    });
  });
});
