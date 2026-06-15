import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock all server-side and external dependencies ────────────────────────────
// vi.mock() is hoisted to the top of the file — use vi.hoisted() so the mock
// function references are available before initialization.

const { mockSendEmail, mockAuditLog, mockExtractDocumentFields } = vi.hoisted(() => ({
  mockSendEmail: vi.fn().mockResolvedValue(undefined),
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
  mockExtractDocumentFields: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/sender", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/audit/log", () => ({ auditLog: mockAuditLog }));
vi.mock("@/lib/documents/extractor", () => ({
  extractDocumentFields: mockExtractDocumentFields,
}));

// Supabase admin client mock — built as a chainable fluent builder
function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  const storage = {
    from: vi.fn().mockReturnValue({
      upload: vi.fn().mockResolvedValue({ error: null }),
    }),
  };

  const base = {
    from: vi.fn(),
    storage,
    ...overrides,
  };

  // Default query chain: .select().eq().single() → configurable data/error
  const chain = (data: unknown, error: unknown = null) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data, error }),
    insert: vi.fn().mockResolvedValue({ data, error }),
    update: vi.fn().mockReturnThis(),
  });

  return { ...base, _chain: chain };
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";
import { NextRequest } from "next/server";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PDF_BASE64 = Buffer.from("%PDF-1.4 minimal").toString("base64");

const BASE_PAYLOAD = {
  From: "client@example.com",
  FromName: "Jane Client",
  FromFull: { Email: "client@example.com", Name: "Jane Client", MailboxHash: "" },
  To: "ops@inbound.postmarkapp.com",
  Subject: "Report request",
  TextBody: "See attached.",
  HtmlBody: "<p>See attached.</p>",
  MailboxHash: "",
  Attachments: [],
  MessageID: "msg-abc",
  Date: "2024-01-15T09:00:00Z",
};

const CLIENT_USER = {
  id: "user-1",
  email: "client@example.com",
  org_id: "org-1",
  role: "client",
};

const ORG = {
  id: "org-1",
  name: "Stockland",
  email_whitelist: [],
  abandoned_draft_days: 14,
};

const EMPTY_EXTRACTION = {
  po_number: { value: "", confidence: "low" },
  client_address: { value: "", confidence: "low" },
  house_type: { value: "", confidence: "low" },
  site_wd_no: { value: "", confidence: "low" },
  floor_wd_no: { value: "", confidence: "low" },
  roof_wd_no: { value: "", confidence: "low" },
  draw_date: { value: "", confidence: "low" },
  dev_name: { value: "", confidence: "low" },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractDocumentFields.mockResolvedValue(EMPTY_EXTRACTION);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 for malformed Postmark payload (missing From)", async () => {
    vi.mocked(createAdminClient).mockReturnValue({} as ReturnType<typeof createAdminClient>);
    const res = await POST(makeRequest({ Subject: "no From field" }));
    expect(res.status).toBe(200);
  });

  describe("unrecognised sender", () => {
    it("sends unrecognised-sender email and audits when user not found", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
        }),
      } as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(BASE_PAYLOAD));

      expect(res.status).toBe(200);
      expect(mockSendEmail).toHaveBeenCalledOnce();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "client@example.com",
          subject: expect.stringContaining("Unrecognised"),
        })
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        "email.unrecognised_sender",
        null,
        "client@example.com",
        expect.anything()
      );
    });
  });

  describe("whitelist enforcement", () => {
    it("blocks sender and audits when org has whitelist and domain does not match", async () => {
      let callCount = 0;
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ data: CLIENT_USER, error: null });
            return Promise.resolve({
              data: { ...ORG, email_whitelist: ["allowed.com"] },
              error: null,
            });
          }),
        }),
      } as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(BASE_PAYLOAD)); // sender is example.com, not allowed.com

      expect(res.status).toBe(200);
      expect(mockSendEmail).toHaveBeenCalledOnce();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining("not permitted") })
      );
      expect(mockAuditLog).toHaveBeenCalledWith("email.whitelist_blocked", "user-1", "client@example.com", expect.anything());
    });

    it("allows sender when their domain is in the whitelist", async () => {
      let callCount = 0;
      const insertMock = vi.fn().mockResolvedValue({ data: { id: "proj-1" }, error: null });

      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ data: CLIENT_USER, error: null });
            if (callCount === 2)
              return Promise.resolve({
                data: { ...ORG, email_whitelist: ["example.com"] },
                error: null,
              });
            return Promise.resolve({ data: { id: "proj-1" }, error: null });
          }),
          insert: insertMock,
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          update: vi.fn().mockReturnThis(),
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            upload: vi.fn().mockResolvedValue({ error: null }),
          }),
        },
      } as unknown as ReturnType<typeof createAdminClient>);

      // No attachments → should hit the no-attachment path, not the whitelist block
      const res = await POST(makeRequest(BASE_PAYLOAD));
      expect(res.status).toBe(200);
      // Should NOT have been blocked (whitelist_blocked would have a different email subject)
      const blocked = mockSendEmail.mock.calls.find((c) =>
        (c[0] as { subject: string }).subject?.includes("not permitted")
      );
      expect(blocked).toBeUndefined();
    });
  });

  describe("no attachments path", () => {
    it("sends instructions email when no supported attachments", async () => {
      let callCount = 0;
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ data: CLIENT_USER, error: null });
            return Promise.resolve({ data: ORG, error: null });
          }),
        }),
      } as unknown as ReturnType<typeof createAdminClient>);

      const payload = { ...BASE_PAYLOAD, Attachments: [] };
      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      expect(mockSendEmail).toHaveBeenCalledOnce();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining("portal") })
      );
      expect(mockAuditLog).toHaveBeenCalledWith("email.no_attachments", "user-1", "client@example.com", expect.anything());
    });

    it("ignores unsupported attachment types (e.g. .docx)", async () => {
      let callCount = 0;
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return Promise.resolve({ data: CLIENT_USER, error: null });
            return Promise.resolve({ data: ORG, error: null });
          }),
        }),
      } as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        Attachments: [
          { Name: "doc.docx", Content: "abc", ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ContentLength: 100 },
        ],
      };
      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      expect(mockAuditLog).toHaveBeenCalledWith("email.no_attachments", expect.anything(), expect.anything(), expect.anything());
    });
  });

  describe("new submission with PDF attachment", () => {
    function makeFullSupabaseMock(projectId = "proj-1") {
      let selectCallCount = 0;

      const fromMock = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockImplementation(() => {
          selectCallCount++;
          if (selectCallCount === 1) return Promise.resolve({ data: CLIENT_USER, error: null }); // user lookup
          if (selectCallCount === 2) return Promise.resolve({ data: ORG, error: null }); // org lookup
          if (selectCallCount === 3) return Promise.resolve({ data: { id: projectId }, error: null }); // project insert
          return Promise.resolve({ data: { extracted_fields: null, po_number: null }, error: null }); // extracted_fields fetch
        }),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { id: projectId }, error: null }),
        }),
        update: vi.fn().mockResolvedValue({ error: null }),
      });

      return {
        from: fromMock,
        storage: {
          from: vi.fn().mockReturnValue({
            upload: vi.fn().mockResolvedValue({ error: null }),
          }),
        },
      };
    }

    it("creates a draft project and sends portal link", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        makeFullSupabaseMock() as unknown as ReturnType<typeof createAdminClient>
      );

      const payload = {
        ...BASE_PAYLOAD,
        Attachments: [
          { Name: "plans.pdf", Content: PDF_BASE64, ContentType: "application/pdf", ContentLength: 100 },
        ],
      };

      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      expect(mockSendEmail).toHaveBeenCalledOnce();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "client@example.com",
          subject: expect.stringContaining("draft is ready"),
        })
      );
      expect(mockAuditLog).toHaveBeenCalledWith("email.draft_created", "user-1", "client@example.com", expect.anything());
    });

    it("runs field extraction on PDF attachments", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        makeFullSupabaseMock() as unknown as ReturnType<typeof createAdminClient>
      );

      const payload = {
        ...BASE_PAYLOAD,
        Attachments: [
          { Name: "plans.pdf", Content: PDF_BASE64, ContentType: "application/pdf", ContentLength: 100 },
        ],
      };

      await POST(makeRequest(payload));

      expect(mockExtractDocumentFields).toHaveBeenCalledOnce();
    });

    it("skips extraction when only image attachments are present", async () => {
      vi.mocked(createAdminClient).mockReturnValue(
        makeFullSupabaseMock() as unknown as ReturnType<typeof createAdminClient>
      );

      const payload = {
        ...BASE_PAYLOAD,
        Attachments: [
          { Name: "plan.jpg", Content: PDF_BASE64, ContentType: "image/jpeg", ContentLength: 100 },
        ],
      };

      await POST(makeRequest(payload));

      expect(mockExtractDocumentFields).not.toHaveBeenCalled();
    });
  });

  describe("thread reply via MailboxHash", () => {
    it("adds attachments to existing draft and audits", async () => {
      let selectCallCount = 0;
      const existingProjectId = "existing-proj-1";

      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) return Promise.resolve({ data: CLIENT_USER, error: null }); // user
            if (selectCallCount === 2) return Promise.resolve({ data: ORG, error: null }); // org
            if (selectCallCount === 3)
              return Promise.resolve({
                data: { id: existingProjectId, org_id: "org-1", status: "draft" },
                error: null,
              }); // project
            return Promise.resolve({ data: { extracted_fields: null, po_number: null }, error: null });
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockResolvedValue({ error: null }),
        }),
        storage: {
          from: vi.fn().mockReturnValue({
            upload: vi.fn().mockResolvedValue({ error: null }),
          }),
        },
      } as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        MailboxHash: existingProjectId,
        Attachments: [
          { Name: "extra-plans.pdf", Content: PDF_BASE64, ContentType: "application/pdf", ContentLength: 100 },
        ],
      };

      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      expect(mockAuditLog).toHaveBeenCalledWith(
        "email.thread_attachments_added",
        "user-1",
        "client@example.com",
        expect.anything()
      );
      // Should NOT send a portal link email for thread replies
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it("rejects a MailboxHash pointing to a non-draft project", async () => {
      let selectCallCount = 0;

      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) return Promise.resolve({ data: CLIENT_USER, error: null });
            if (selectCallCount === 2) return Promise.resolve({ data: ORG, error: null });
            // Project is in 'submitted' status — not a valid draft to append to
            return Promise.resolve({
              data: { id: "proj-x", org_id: "org-1", status: "submitted" },
              error: null,
            });
          }),
        }),
      } as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        MailboxHash: "proj-x",
        Attachments: [
          { Name: "plans.pdf", Content: PDF_BASE64, ContentType: "application/pdf", ContentLength: 100 },
        ],
      };

      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      expect(mockAuditLog).toHaveBeenCalledWith(
        "email.thread_reply_invalid",
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe("non-client role", () => {
    it("returns 200 silently for consultant senders", async () => {
      let callCount = 0;
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1)
              return Promise.resolve({
                data: { ...CLIENT_USER, role: "consultant" },
                error: null,
              });
            return Promise.resolve({ data: ORG, error: null });
          }),
        }),
      } as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(BASE_PAYLOAD));
      expect(res.status).toBe(200);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
