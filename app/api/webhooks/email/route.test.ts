import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  client_id: "org-1",
  role: "stakeholder",
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

  describe("Basic Auth", () => {
    const ORIGINAL_USER = process.env.POSTMARK_INBOUND_WEBHOOK_USER;
    const ORIGINAL_PASSWORD = process.env.POSTMARK_INBOUND_WEBHOOK_PASSWORD;

    beforeEach(() => {
      process.env.POSTMARK_INBOUND_WEBHOOK_USER = "webhook-user";
      process.env.POSTMARK_INBOUND_WEBHOOK_PASSWORD = "webhook-pass";
    });

    afterEach(() => {
      if (ORIGINAL_USER === undefined) delete process.env.POSTMARK_INBOUND_WEBHOOK_USER;
      else process.env.POSTMARK_INBOUND_WEBHOOK_USER = ORIGINAL_USER;
      if (ORIGINAL_PASSWORD === undefined) delete process.env.POSTMARK_INBOUND_WEBHOOK_PASSWORD;
      else process.env.POSTMARK_INBOUND_WEBHOOK_PASSWORD = ORIGINAL_PASSWORD;
    });

    it("returns 401 with no Authorization header", async () => {
      const res = await POST(makeRequest(BASE_PAYLOAD));
      expect(res.status).toBe(401);
    });

    it("returns 401 with incorrect credentials", async () => {
      const req = new NextRequest("http://localhost/api/webhooks/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from("webhook-user:wrong-pass").toString("base64")}`,
        },
        body: JSON.stringify(BASE_PAYLOAD),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("processes the request with correct credentials", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
        }),
      } as unknown as ReturnType<typeof createAdminClient>);

      const req = new NextRequest("http://localhost/api/webhooks/email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from("webhook-user:webhook-pass").toString("base64")}`,
        },
        body: JSON.stringify(BASE_PAYLOAD),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
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
                data: { id: existingProjectId, client_id: "org-1", status: "draft" },
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
          // Stakeholder-reply token lookup (checked before sender lookup) —
          // no match, so this falls through to the ordinary draft-thread flow.
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockImplementation(() => {
            selectCallCount++;
            if (selectCallCount === 1) return Promise.resolve({ data: CLIENT_USER, error: null });
            if (selectCallCount === 2) return Promise.resolve({ data: ORG, error: null });
            // Project is in 'submitted' status — not a valid draft to append to
            return Promise.resolve({
              data: { id: "proj-x", client_id: "org-1", status: "submitted" },
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

  describe("stakeholder email reply threading (#68)", () => {
    const TOKEN = "abc123reviewtoken";
    const REVIEW = {
      id: "review-1",
      project_id: "proj-1",
      stakeholder_email: "stakeholder@external.com",
      stakeholder_name: "Sam Stakeholder",
      status: "pending",
    };
    const PROJECT = {
      id: "proj-1",
      client_id: "org-1",
      submitted_by: "user-1",
      assigned_consultant_id: "consultant-1",
      qa_completed_by: null,
      extracted_fields: null,
      project_number: "PN-100",
    };

    function makeMock({ senderKnown = true }: { senderKnown?: boolean } = {}) {
      const reviewUpdateEq = vi.fn().mockResolvedValue({ data: null, error: null });
      const reviewUpdate = vi.fn().mockReturnValue({ eq: reviewUpdateEq });
      const projectFilesInsertSingle = vi.fn().mockResolvedValue({ data: { id: "file-1" }, error: null });
      const notificationsInsert = vi.fn().mockResolvedValue({ data: null, error: null });

      const fromMock = vi.fn((table: string) => {
        switch (table) {
          case "stakeholder_reviews":
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: REVIEW, error: null }),
              update: reviewUpdate,
            };
          case "projects":
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: PROJECT, error: null }),
            };
          case "stakeholders":
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              order: vi.fn().mockResolvedValue({
                data: senderKnown
                  ? [{ id: "s1", name: "Sam Stakeholder", email: "stakeholder@external.com", company: null }]
                  : [],
              }),
            };
          case "users":
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({ data: [{ id: "admin-1" }] }),
              maybeSingle: vi.fn().mockResolvedValue({ data: { email: "submitter@example.com" }, error: null }),
              single: vi.fn().mockResolvedValue({ data: { email: "consultant@example.com" }, error: null }),
            };
          case "project_files":
            return {
              insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnThis(),
                single: projectFilesInsertSingle,
              }),
            };
          case "notifications":
            return { insert: notificationsInsert };
          default:
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
        }
      });

      return {
        from: fromMock,
        storage: {
          from: vi.fn().mockReturnValue({
            upload: vi.fn().mockResolvedValue({ error: null }),
          }),
        },
        reviewUpdateEq,
        reviewUpdate,
      };
    }

    it("links a reply from a known stakeholder, stores it as verified, and skips the sender-lookup gate", async () => {
      const mock = makeMock({ senderKnown: true });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        From: "stakeholder@external.com",
        FromFull: { Email: "stakeholder@external.com", Name: "Sam Stakeholder", MailboxHash: TOKEN },
        MailboxHash: TOKEN,
        TextBody: "Looks good, approved from my end.",
      };

      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      // The sender-lookup "unrecognised sender" bounce must NOT fire — this
      // sender has no `users` row at all, only a `stakeholders` roster entry.
      const bounced = mockSendEmail.mock.calls.some((c) =>
        (c[0] as { subject: string }).subject?.includes("Unrecognised")
      );
      expect(bounced).toBe(false);

      expect(mock.reviewUpdateEq).toHaveBeenCalledWith("id", "review-1");

      expect(mockAuditLog).toHaveBeenCalledWith(
        "stakeholder.email_reply_received",
        null,
        "stakeholder@external.com",
        expect.objectContaining({
          metadata: expect.objectContaining({ review_id: "review-1", sender_verified: true }),
        })
      );

      // Independent notification to the assigned consultant + admins.
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining("needs action") })
      );
    });

    it("prefers Postmark's StrippedTextReply over the full TextBody when both are present", async () => {
      const mock = makeMock({ senderKnown: true });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        From: "stakeholder@external.com",
        FromFull: { Email: "stakeholder@external.com", Name: "Sam Stakeholder", MailboxHash: TOKEN },
        MailboxHash: TOKEN,
        TextBody: "Approved.\n\nOn Mon, Jan 1 wrote:\n> quoted history\n--\nSam, Sent from my iPhone",
        StrippedTextReply: "Approved.",
      };

      await POST(makeRequest(payload));

      expect(mock.reviewUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ email_reply_text: "Approved." })
      );
    });

    it("falls back to TextBody when StrippedTextReply is absent", async () => {
      const mock = makeMock({ senderKnown: true });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        From: "stakeholder@external.com",
        FromFull: { Email: "stakeholder@external.com", Name: "Sam Stakeholder", MailboxHash: TOKEN },
        MailboxHash: TOKEN,
        TextBody: "Approved from my end.",
        StrippedTextReply: "",
      };

      await POST(makeRequest(payload));

      expect(mock.reviewUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ email_reply_text: "Approved from my end." })
      );
    });

    it("flags the reply as unverified when the sender isn't a known project/client stakeholder", async () => {
      const mock = makeMock({ senderKnown: false });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        From: "someone-else@example.com",
        FromFull: { Email: "someone-else@example.com", Name: "", MailboxHash: TOKEN },
        MailboxHash: TOKEN,
        TextBody: "Forwarding this along, approved.",
      };

      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      expect(mockAuditLog).toHaveBeenCalledWith(
        "stakeholder.email_reply_received",
        null,
        "someone-else@example.com",
        expect.objectContaining({
          metadata: expect.objectContaining({ sender_verified: false }),
        })
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
