import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetSessionUser, mockCreateAdminClient } = vi.hoisted(() => ({
  mockGetSessionUser: vi.fn(),
  mockCreateAdminClient: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mockGetSessionUser }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mockCreateAdminClient }));

import { GET } from "./route";

const PROJECT_ID = "proj-1";

function makeQuery(data: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is"]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  return query;
}

function call() {
  return GET({} as never, { params: Promise.resolve({ id: PROJECT_ID }) });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/projects/[id]/progress", () => {
  it("returns progressPct with Cache-Control: no-store", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "a-1", role: "admin" });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(makeQuery({ progress_pct: 40 })) });

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ progressPct: 40 });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns null when nothing is in flight", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "a-1", role: "super_admin" });
    mockCreateAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(makeQuery({ progress_pct: null })) });

    const res = await call();

    expect(await res.json()).toEqual({ progressPct: null });
  });

  it("scopes consultants to their assigned projects", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "c-1", role: "consultant" });
    const query = makeQuery(null);
    mockCreateAdminClient.mockReturnValue({ from: vi.fn().mockReturnValue(query) });

    const res = await call();

    expect(query.eq).toHaveBeenCalledWith("assigned_consultant_id", "c-1");
    expect(res.status).toBe(404);
  });

  it.each([null, { id: "s-1", role: "stakeholder" }, { id: "cl-1", role: "client" }])(
    "rejects %o with 403",
    async (user) => {
      mockGetSessionUser.mockResolvedValue(user);

      const res = await call();

      expect(res.status).toBe(403);
      expect(mockCreateAdminClient).not.toHaveBeenCalled();
    }
  );
});
