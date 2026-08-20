import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuditLog, mockGetSessionUser } = vi.hoisted(() => ({
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
  mockGetSessionUser: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/log", () => ({ auditLog: mockAuditLog }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mockGetSessionUser }));

function makeQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "order", "limit", "is"]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.maybeSingle = vi.fn().mockResolvedValue(result);
  return query;
}

function makeSupabaseMock(opts: {
  fileResult: { data: unknown; error: unknown };
  projectResult?: { data: unknown; error: unknown };
  createSignedUrlResult?: { data: unknown; error: unknown };
}) {
  const fileQuery = makeQuery(opts.fileResult);
  const projectQuery = makeQuery(opts.projectResult ?? { data: { client_id: "org-1" }, error: null });
  const updateEqFn = vi.fn().mockReturnValue({
    is: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  const from = vi.fn((table: string) => {
    if (table === "project_files") return fileQuery;
    if (table === "projects") return { ...projectQuery, update: vi.fn().mockReturnValue({ eq: updateEqFn }) };
    throw new Error(`Unexpected table: ${table}`);
  });
  const createSignedUrl = vi
    .fn()
    .mockResolvedValue(opts.createSignedUrlResult ?? { data: { signedUrl: "https://storage.example/signed" }, error: null });
  return { from, storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) } };
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "./route";
import { getDownloadProgress } from "@/lib/downloads/download-progress";

function makeParams(fileId: string) {
  return { params: Promise.resolve({ fileId }) };
}

const FILE_ROW = {
  id: "file-1",
  project_id: "project-1",
  storage_path: "org-1/project-1/pbdb/v1.docx",
  original_filename: "159159-S PBDB Rev0.docx",
  version: 1,
};

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

describe("GET /api/download/pbdb/[fileId]", () => {
  it("rejects when there is no session", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/download/pbdb/file-1"), makeParams("file-1"));
    expect(res.status).toBe(401);
  });

  it("rejects an unauthorised role", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "u1", email: "u@x.com", role: "stakeholder" });
    const res = await GET(new Request("http://localhost/api/download/pbdb/file-1"), makeParams("file-1"));
    expect(res.status).toBe(401);
  });

  it("404s when the file doesn't exist", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "admin-1", email: "a@x.com", role: "admin" });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock({ fileResult: { data: null, error: null } })
    );
    const res = await GET(new Request("http://localhost/api/download/pbdb/file-1"), makeParams("file-1"));
    expect(res.status).toBe(404);
  });

  it("403s a consultant who is not assigned to the project", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "consultant-1", email: "c@x.com", role: "consultant" });
    const mock = makeSupabaseMock({
      fileResult: { data: FILE_ROW, error: null },
      projectResult: { data: { assigned_consultant_id: "someone-else", client_id: "org-1" }, error: null },
    });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mock);
    const res = await GET(new Request("http://localhost/api/download/pbdb/file-1"), makeParams("file-1"));
    expect(res.status).toBe(403);
  });

  it("streams the file, sets Content-Length from upstream, and audit-logs the download", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "admin-1", email: "admin@x.com", role: "admin" });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock({ fileResult: { data: FILE_ROW, error: null } })
    );

    const res = await GET(new Request("http://localhost/api/download/pbdb/file-1"), makeParams("file-1"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("4");
    expect(res.headers.get("content-disposition")).toContain("159159-S PBDB Rev0.docx");
    expect(res.body).toBeTruthy();

    const buf = await res.arrayBuffer();
    expect(new Uint8Array(buf)).toEqual(new Uint8Array([1, 2, 3, 4]));

    expect(mockAuditLog).toHaveBeenCalledWith(
      "project.pbdb_downloaded",
      "admin-1",
      "admin@x.com",
      expect.objectContaining({ projectId: "project-1" })
    );
  });

  it("returns 500 when the upstream fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    mockGetSessionUser.mockResolvedValue({ id: "admin-1", email: "admin@x.com", role: "admin" });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock({ fileResult: { data: FILE_ROW, error: null } })
    );

    const res = await GET(new Request("http://localhost/api/download/pbdb/file-1"), makeParams("file-1"));
    expect(res.status).toBe(500);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it("tracks bytes served under the ?dl= id and marks it done once fully streamed", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "admin-1", email: "admin@x.com", role: "admin" });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock({ fileResult: { data: FILE_ROW, error: null } })
    );

    const res = await GET(
      new Request("http://localhost/api/download/pbdb/file-1?dl=test-dl-1"),
      makeParams("file-1")
    );
    await res.arrayBuffer(); // drain the stream so the TransformStream's flush() runs

    const progress = getDownloadProgress("test-dl-1");
    expect(progress).toEqual({ bytesServed: 4, totalBytes: 4, done: true });
  });

  it("does not track progress when no ?dl= id is present", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "admin-1", email: "admin@x.com", role: "admin" });
    (createAdminClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
      makeSupabaseMock({ fileResult: { data: FILE_ROW, error: null } })
    );

    const res = await GET(new Request("http://localhost/api/download/pbdb/file-1"), makeParams("file-1"));
    await res.arrayBuffer();

    expect(getDownloadProgress("undefined")).toBeNull();
  });
});
