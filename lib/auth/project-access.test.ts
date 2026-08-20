import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { requireProjectAccess } from "./project-access";

function buildSupabase({
  project,
  reviewRow = null,
}: {
  project: Record<string, unknown> | null;
  reviewRow?: Record<string, unknown> | null;
}) {
  const from = vi.fn((table: string) => {
    if (table === "projects") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }),
      };
    }
    if (table === "stakeholder_reviews") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: reviewRow, error: null }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { from } as never;
}

const DRAFT_PROJECT = {
  id: "proj-1",
  client_id: "org-a",
  submitted_by: "stakeholder-a",
  assigned_consultant_id: null,
  status: "draft",
};

const ACTIVE_PROJECT = {
  id: "proj-1",
  client_id: "org-a",
  submitted_by: "stakeholder-a",
  assigned_consultant_id: "consultant-1",
  status: "submitted",
};

describe("requireProjectAccess — not found / soft-deleted", () => {
  it("returns null when the project doesn't exist", async () => {
    const supabase = buildSupabase({ project: null });
    const result = await requireProjectAccess(
      supabase,
      { id: "any", role: "admin" },
      "proj-1"
    );
    expect(result).toBeNull();
  });
});

describe("requireProjectAccess — admin/super_admin", () => {
  it("admin sees any project, draft or active", async () => {
    const supabase = buildSupabase({ project: DRAFT_PROJECT });
    const result = await requireProjectAccess(
      supabase,
      { id: "admin-1", role: "admin" },
      "proj-1"
    );
    expect(result).not.toBeNull();
  });

  it("super_admin sees any project", async () => {
    const supabase = buildSupabase({ project: ACTIVE_PROJECT });
    const result = await requireProjectAccess(
      supabase,
      { id: "super-1", role: "super_admin" },
      "proj-1"
    );
    expect(result).not.toBeNull();
  });
});

describe("requireProjectAccess — consultant", () => {
  it("allows the assigned consultant in draft phase", async () => {
    const supabase = buildSupabase({
      project: { ...DRAFT_PROJECT, assigned_consultant_id: "consultant-1" },
    });
    const result = await requireProjectAccess(
      supabase,
      { id: "consultant-1", role: "consultant" },
      "proj-1"
    );
    expect(result).not.toBeNull();
  });

  it("allows the assigned consultant in active phase", async () => {
    const supabase = buildSupabase({ project: ACTIVE_PROJECT });
    const result = await requireProjectAccess(
      supabase,
      { id: "consultant-1", role: "consultant" },
      "proj-1"
    );
    expect(result).not.toBeNull();
  });

  it("denies an unassigned consultant in draft phase", async () => {
    const supabase = buildSupabase({ project: DRAFT_PROJECT }); // assigned_consultant_id: null
    const result = await requireProjectAccess(
      supabase,
      { id: "consultant-2", role: "consultant" },
      "proj-1"
    );
    expect(result).toBeNull();
  });

  it("denies a different consultant in active phase", async () => {
    const supabase = buildSupabase({ project: ACTIVE_PROJECT }); // assigned to consultant-1
    const result = await requireProjectAccess(
      supabase,
      { id: "consultant-2", role: "consultant" },
      "proj-1"
    );
    expect(result).toBeNull();
  });
});

describe("requireProjectAccess — stakeholder, draft phase", () => {
  it("allows the submitter", async () => {
    const supabase = buildSupabase({ project: DRAFT_PROJECT });
    const result = await requireProjectAccess(
      supabase,
      { id: "stakeholder-a", role: "stakeholder", client_id: "org-a" },
      "proj-1"
    );
    expect(result).not.toBeNull();
  });

  it("denies a same-org stakeholder who is not the submitter (#160/#14 same-org IDOR)", async () => {
    const supabase = buildSupabase({ project: DRAFT_PROJECT });
    const result = await requireProjectAccess(
      supabase,
      { id: "stakeholder-b", role: "stakeholder", client_id: "org-a" },
      "proj-1"
    );
    expect(result).toBeNull();
  });

  it("denies a stakeholder from a different org entirely (cross-tenant IDOR)", async () => {
    const supabase = buildSupabase({ project: DRAFT_PROJECT });
    const result = await requireProjectAccess(
      supabase,
      { id: "stakeholder-x", role: "stakeholder", client_id: "org-b" },
      "proj-1"
    );
    expect(result).toBeNull();
  });

  it("does NOT grant access to a same-org reviewer in draft phase — reviewer grant is active-phase only", async () => {
    const supabase = buildSupabase({
      project: DRAFT_PROJECT,
      reviewRow: { id: "review-1" }, // stakeholder-b IS a reviewer, but project is still draft
    });
    const result = await requireProjectAccess(
      supabase,
      { id: "stakeholder-b", role: "stakeholder", client_id: "org-a", email: "b@org-a.test" },
      "proj-1"
    );
    expect(result).toBeNull();
  });
});

describe("requireProjectAccess — stakeholder, active phase", () => {
  it("allows the submitter", async () => {
    const supabase = buildSupabase({ project: ACTIVE_PROJECT });
    const result = await requireProjectAccess(
      supabase,
      { id: "stakeholder-a", role: "stakeholder", client_id: "org-a" },
      "proj-1"
    );
    expect(result).not.toBeNull();
  });

  it("allows a same-org stakeholder who IS a reviewer on this project", async () => {
    const supabase = buildSupabase({
      project: ACTIVE_PROJECT,
      reviewRow: { id: "review-1" },
    });
    const result = await requireProjectAccess(
      supabase,
      { id: "stakeholder-b", role: "stakeholder", client_id: "org-a", email: "b@org-a.test" },
      "proj-1"
    );
    expect(result).not.toBeNull();
  });

  it("denies a same-org stakeholder who is neither submitter nor reviewer", async () => {
    const supabase = buildSupabase({ project: ACTIVE_PROJECT, reviewRow: null });
    const result = await requireProjectAccess(
      supabase,
      { id: "stakeholder-b", role: "stakeholder", client_id: "org-a", email: "b@org-a.test" },
      "proj-1"
    );
    expect(result).toBeNull();
  });

  it("denies a cross-org stakeholder even if (hypothetically) a reviewer row existed", async () => {
    const supabase = buildSupabase({
      project: ACTIVE_PROJECT,
      reviewRow: { id: "review-1" },
    });
    const result = await requireProjectAccess(
      supabase,
      { id: "stakeholder-x", role: "stakeholder", client_id: "org-b", email: "x@org-b.test" },
      "proj-1"
    );
    // client_id check fails first — never even reaches the reviewer lookup's
    // outcome mattering, since org mismatch is fatal on its own.
    expect(result).toBeNull();
  });

  it("denies when the stakeholder has no email (can't be looked up as a reviewer)", async () => {
    const supabase = buildSupabase({ project: ACTIVE_PROJECT, reviewRow: { id: "review-1" } });
    const result = await requireProjectAccess(
      supabase,
      { id: "stakeholder-b", role: "stakeholder", client_id: "org-a" }, // no email
      "proj-1"
    );
    expect(result).toBeNull();
  });
});

describe("requireProjectAccess — explicit phase override", () => {
  it("honors an explicitly-passed phase over the row's own status", async () => {
    // Row says active (assigned), but caller asserts draft phase explicitly —
    // draft rules (submitter-only, no reviewer grant) should apply.
    const supabase = buildSupabase({
      project: ACTIVE_PROJECT,
      reviewRow: { id: "review-1" },
    });
    const result = await requireProjectAccess(
      supabase,
      { id: "stakeholder-b", role: "stakeholder", client_id: "org-a", email: "b@org-a.test" },
      "proj-1",
      "draft"
    );
    expect(result).toBeNull();
  });
});

describe("requireProjectAccess — unknown role", () => {
  it("denies a role outside the four known roles", async () => {
    const supabase = buildSupabase({ project: DRAFT_PROJECT });
    const result = await requireProjectAccess(
      supabase,
      { id: "x", role: "something_else" },
      "proj-1"
    );
    expect(result).toBeNull();
  });
});
