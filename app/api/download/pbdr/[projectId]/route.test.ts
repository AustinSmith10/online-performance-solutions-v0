import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuditLog, mockGetSessionUser } = vi.hoisted(() => ({
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
  mockGetSessionUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/log", () => ({ auditLog: mockAuditLog }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mockGetSessionUser }));

// Chainable query builder stub — every method but the terminal one returns
// `this` so `.select().eq().eq().maybeSingle()` style chains work regardless
// of which combination of filters a given branch calls.
function makeQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "or"]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  return query;
}

function makeSupabaseMock(opts: {
  projectResult: { data: unknown; error: unknown };
  pbdrFileResult?: { data: unknown; error: unknown };
  signedUrlResult?: { data: unknown; error: unknown };
  reviewedProjectIds?: string[];
}) {
  const projectQuery = makeQuery(opts.projectResult);
  const fileQuery = makeQuery(
    opts.pbdrFileResult ?? {
      data: { storage_path: "path/to/file.docx", original_filename: "report.docx" },
      error: null,
    }
  );
  const stakeholderReviewsQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({
      data: (opts.reviewedProjectIds ?? []).map((id) => ({ project_id: id })),
      error: null,
    }),
  };
  const from = vi.fn((table: string) => {
    if (table === "projects") return projectQuery;
    if (table === "project_files") return fileQuery;
    if (table === "stakeholder_reviews") return stakeholderReviewsQuery;
    throw new Error(`Unexpected table: ${table}`);
  });
  const createSignedUrl = vi.fn().mockResolvedValue(
    opts.signedUrlResult ?? { data: { signedUrl: "https://storage.example/signed" }, error: null }
  );
  return {
    from,
    storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "./route";
import { getDownloadProgress } from "@/lib/downloads/download-progress";

function makeParams(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(new Blob([new Uint8Array([1, 2, 3, 4])]), {
        status: 200,
        headers: { "content-length": "4", "content-type": "application/octet-stream" },
      })
    )
  );
});

describe("GET /api/download/pbdr/[projectId]", () => {
  it("denies a consultant who is not assigned to the project", async () => {
    mockGetSessionUser.mockResolvedValue({
      id: "consultant-1",
      email: "consultant@example.com",
      role: "consultant",
      client_id: null,
    });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock({ projectResult: { data: null, error: null } })
    );

    const res = await GET(new Request("http://localhost"), makeParams("project-1"));

    expect(res.status).toBe(404);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it("lets the assigned consultant download the latest PBDR and audit-logs it", async () => {
    mockGetSessionUser.mockResolvedValue({
      id: "consultant-1",
      email: "consultant@example.com",
      role: "consultant",
      client_id: null,
    });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock({ projectResult: { data: { id: "project-1" }, error: null } })
    );

    const res = await GET(new Request("http://localhost"), makeParams("project-1"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("4");
    expect(mockAuditLog).toHaveBeenCalledWith(
      "project.pbdr_downloaded",
      "consultant-1",
      "consultant@example.com",
      expect.objectContaining({
        projectId: "project-1",
        metadata: expect.objectContaining({ role: "consultant" }),
      })
    );
  });

  it("still allows an internal stakeholder on a delivered project (existing path unaffected)", async () => {
    mockGetSessionUser.mockResolvedValue({
      id: "stakeholder-1",
      email: "stakeholder@example.com",
      role: "stakeholder",
      client_id: "org-1",
    });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock({
        projectResult: { data: { id: "project-1", client_id: "org-1" }, error: null },
      })
    );

    const res = await GET(new Request("http://localhost"), makeParams("project-1"));

    expect(res.status).toBe(200);
    expect(mockAuditLog).toHaveBeenCalledWith(
      "project.pbdr_downloaded",
      "stakeholder-1",
      "stakeholder@example.com",
      expect.objectContaining({ orgId: "org-1" })
    );
  });

  it("allows a stakeholder who reviewed the project but did not submit it", async () => {
    mockGetSessionUser.mockResolvedValue({
      id: "stakeholder-2",
      email: "reviewer@example.com",
      role: "stakeholder",
      client_id: "org-1",
    });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock({
        projectResult: { data: { id: "project-1", client_id: "org-1" }, error: null },
        reviewedProjectIds: ["project-1"],
      })
    );

    const res = await GET(new Request("http://localhost"), makeParams("project-1"));

    expect(res.status).toBe(200);
  });

  it.each(["admin", "super_admin"] as const)(
    "lets a %s download the PBDR for any project and audit-logs it",
    async (role) => {
      mockGetSessionUser.mockResolvedValue({
        id: "admin-1",
        email: "admin@example.com",
        role,
        client_id: null,
      });
      (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        makeSupabaseMock({ projectResult: { data: { id: "project-1" }, error: null } })
      );

      const res = await GET(new Request("http://localhost"), makeParams("project-1"));

      expect(res.status).toBe(200);
      expect(mockAuditLog).toHaveBeenCalledWith(
        "project.pbdr_downloaded",
        "admin-1",
        "admin@example.com",
        expect.objectContaining({ metadata: expect.objectContaining({ role }) })
      );
    }
  );

  it("rejects an unauthorised role", async () => {
    mockGetSessionUser.mockResolvedValue({
      id: "someone-1",
      email: "someone@example.com",
      role: "unknown_role",
      client_id: null,
    });

    const res = await GET(new Request("http://localhost"), makeParams("project-1"));

    expect(res.status).toBe(401);
  });

  it("rejects when there is no session", async () => {
    mockGetSessionUser.mockResolvedValue(null);

    const res = await GET(new Request("http://localhost"), makeParams("project-1"));

    expect(res.status).toBe(401);
  });

  it("tracks bytes served under the ?dl= id and marks it done once fully streamed (#129)", async () => {
    mockGetSessionUser.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      client_id: null,
    });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock({ projectResult: { data: { id: "project-1" }, error: null } })
    );

    const res = await GET(
      new Request("http://localhost?dl=pbdr-dl-1"),
      makeParams("project-1")
    );
    await res.arrayBuffer();

    expect(getDownloadProgress("pbdr-dl-1")).toEqual({ bytesServed: 4, totalBytes: 4, done: true });
  });
});
