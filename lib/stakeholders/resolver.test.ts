import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");

import { resolveStakeholders } from "./resolver";
import { createAdminClient } from "@/lib/supabase/admin";

const PROJECT_STAKEHOLDERS = [
  { id: "ps-1", name: "Project Contact", email: "project@example.com", company: "Acme" },
];

const ORG_STAKEHOLDERS = [
  { id: "os-1", name: "Org Contact", email: "org@example.com", company: null },
  { id: "os-2", name: "Org Contact 2", email: "org2@example.com", company: null },
];

function buildMock(projectRows: unknown[], orgRows: unknown[]) {
  let callCount = 0;
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve({ data: callCount === 1 ? projectRows : orgRows, error: null });
    }),
  };
  return { from: vi.fn().mockReturnValue(chain) };
}

describe("resolveStakeholders", () => {
  it("returns project-level stakeholders when they exist", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMock(PROJECT_STAKEHOLDERS, ORG_STAKEHOLDERS) as never
    );
    const result = await resolveStakeholders("proj-1", "org-1");
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("project@example.com");
  });

  it("falls back to org-level stakeholders when project has none", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMock([], ORG_STAKEHOLDERS) as never
    );
    const result = await resolveStakeholders("proj-1", "org-1");
    expect(result).toHaveLength(2);
    expect(result[0].email).toBe("org@example.com");
  });

  it("returns an empty array when neither level has stakeholders", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock([], []) as never);
    const result = await resolveStakeholders("proj-1", "org-1");
    expect(result).toHaveLength(0);
  });

  it("does not include org stakeholders when project stakeholders exist", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMock(PROJECT_STAKEHOLDERS, ORG_STAKEHOLDERS) as never
    );
    const result = await resolveStakeholders("proj-1", "org-1");
    const emails = result.map((s) => s.email);
    expect(emails).not.toContain("org@example.com");
  });

  it("returns name, email, and company from the resolved list", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMock(PROJECT_STAKEHOLDERS, []) as never
    );
    const result = await resolveStakeholders("proj-1", "org-1");
    expect(result[0]).toMatchObject({
      name: "Project Contact",
      email: "project@example.com",
      company: "Acme",
    });
  });
});
