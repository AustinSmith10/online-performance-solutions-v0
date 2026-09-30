import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuditLog, mockGetSessionUser, mockResolve, mockGenerate } = vi.hoisted(() => ({
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
  mockGetSessionUser: vi.fn(),
  mockResolve: vi.fn(),
  mockGenerate: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/log", () => ({ auditLog: mockAuditLog }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mockGetSessionUser }));
vi.mock("@/lib/documents/sent-pdf", () => ({ resolveSentPdf: mockResolve }));
// The route must never (re)render — if it imports the generators, this trips.
vi.mock("@/lib/documents/pbdb-pdf", () => ({ getOrCreateDispatchPdf: mockGenerate, getDispatchPdfForCycle: mockGenerate }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from "@/lib/supabase/admin";
import { GET } from "./route";

const SENT = {
  projectId: "p1",
  docType: "pbdb" as const,
  storagePath: "org/p1/pbdb/sent.pdf",
  originalFilename: "Rev1 sent.pdf",
};

function setup(project: { assigned_consultant_id: string; client_id: string } | null = { assigned_consultant_id: "c1", client_id: "o1" }) {
  const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://storage.example/signed?x=1" }, error: null });
  const single = { maybeSingle: vi.fn().mockResolvedValue({ data: project }) };
  const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnValue(single) };
  (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
    from: vi.fn().mockReturnValue(chain),
    storage: { from: vi.fn().mockReturnValue({ createSignedUrl }) },
  });
  return { createSignedUrl };
}

const call = () => GET(new Request("http://x/api/download/sent/f1"), { params: Promise.resolve({ fileId: "f1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockResolve.mockResolvedValue(SENT);
});

describe("GET /api/download/sent/[fileId] (#208)", () => {
  it.each(["stakeholder", undefined])("refuses %s", async (role) => {
    mockGetSessionUser.mockResolvedValue(role ? { id: "u", email: "e", role } : null);
    setup();
    expect((await call()).status).toBe(401);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it("refuses a consultant who is not assigned to the project", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "other", email: "o@x", role: "consultant" });
    setup();
    expect((await call()).status).toBe(403);
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it.each([
    ["admin", "a1"],
    ["super_admin", "s1"],
    ["consultant", "c1"],
  ])("serves the stored file byte-for-byte to %s and audits it", async (role, id) => {
    mockGetSessionUser.mockResolvedValue({ id, email: `${id}@x`, role });
    const { createSignedUrl } = setup();
    const res = await call();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://storage.example/signed?x=1");
    // Signs exactly the stored path with a short expiry; nothing is regenerated.
    expect(createSignedUrl).toHaveBeenCalledWith(SENT.storagePath, 60, { download: SENT.originalFilename });
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(
      "project.sent_pdf_downloaded",
      id,
      `${id}@x`,
      expect.objectContaining({ projectId: "p1", metadata: expect.objectContaining({ doc_type: "pbdb", role }) })
    );
  });

  it("404s when nothing was sent for that revision", async () => {
    mockResolve.mockResolvedValue(null);
    mockGetSessionUser.mockResolvedValue({ id: "a1", email: "a@x", role: "admin" });
    setup();
    expect((await call()).status).toBe(404);
  });
});
