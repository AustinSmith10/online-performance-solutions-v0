import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Mock all server-side and external dependencies ────────────────────────────
// vi.mock() is hoisted to the top of the file — use vi.hoisted() so the mock
// function references are available before initialization.

const { mockSendEmail, mockAuditLog, mockValidateToken } = vi.hoisted(() => ({
  mockSendEmail: vi.fn().mockResolvedValue(true),
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
  mockValidateToken: vi.fn().mockResolvedValue(null),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/sender", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/audit/log", () => ({ auditLog: mockAuditLog }));
vi.mock("@/lib/stakeholders/tokens", () => ({ validateToken: mockValidateToken }));

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

// Builds a mock query-builder object supporting the chain shapes the route
// uses (select/eq/ilike/is/limit/maybeSingle/single/insert) with resolved
// values driven by table name, so each test can target only the tables it
// cares about.
function makeQueryBuilder(overrides: Record<string, unknown> = {}) {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert,
    _upload: upload,
    ...overrides,
  };
}

describe("POST /api/webhooks/email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateToken.mockResolvedValue(null);
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
        from: vi.fn().mockReturnValue(makeQueryBuilder()),
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
    it("sends unrecognised-sender email and audits when no users or stakeholders match", async () => {
      vi.mocked(createAdminClient).mockReturnValue({
        from: vi.fn().mockReturnValue(makeQueryBuilder()),
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

    it("queues as stakeholder_response via the stakeholders-table fallback instead of bouncing", async () => {
      const fromMock = vi.fn((table: string) => {
        if (table === "stakeholders") {
          return makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: "sh-1" }, error: null }),
          });
        }
        if (table === "inbound_email_queue") {
          return makeQueryBuilder({ insert: vi.fn().mockResolvedValue({ data: null, error: null }) });
        }
        return makeQueryBuilder();
      });

      vi.mocked(createAdminClient).mockReturnValue({
        from: fromMock,
        storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
      } as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(BASE_PAYLOAD));

      expect(res.status).toBe(200);
      // No bounce — a holding reply instead.
      const bounced = mockSendEmail.mock.calls.some((c) =>
        (c[0] as { subject: string }).subject?.includes("Unrecognised")
      );
      expect(bounced).toBe(false);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "client@example.com", subject: expect.stringContaining("received") })
      );

      expect(fromMock).toHaveBeenCalledWith("inbound_email_queue");

      const queueCallIndex = fromMock.mock.calls.findIndex((c) => c[0] === "inbound_email_queue");
      const insertedRow = fromMock.mock.results[queueCallIndex].value.insert.mock.calls[0][0];
      expect(insertedRow).toMatchObject({
        proposed_category: "stakeholder_response",
        proposed_project_id: null,
        proposed_stakeholder_review_id: null,
        match_reason: "stakeholder_table_fallback",
      });
    });
  });

  describe("whitelist enforcement", () => {
    it("blocks sender and audits when org has whitelist and domain does not match", async () => {
      const fromMock = vi.fn((table: string) => {
        if (table === "users") return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: CLIENT_USER, error: null }) });
        if (table === "clients")
          return makeQueryBuilder({
            single: vi.fn().mockResolvedValue({ data: { ...ORG, email_whitelist: ["allowed.com"] }, error: null }),
          });
        return makeQueryBuilder();
      });

      vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(BASE_PAYLOAD)); // sender is example.com, not allowed.com

      expect(res.status).toBe(200);
      expect(mockSendEmail).toHaveBeenCalledOnce();
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ subject: expect.stringContaining("not permitted") })
      );
      expect(mockAuditLog).toHaveBeenCalledWith("email.whitelist_blocked", "user-1", "client@example.com", expect.anything());
    });

    it("allows sender when their domain is in the whitelist", async () => {
      const fromMock = vi.fn((table: string) => {
        if (table === "users") return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: CLIENT_USER, error: null }) });
        if (table === "clients")
          return makeQueryBuilder({
            single: vi.fn().mockResolvedValue({ data: { ...ORG, email_whitelist: ["example.com"] }, error: null }),
          });
        return makeQueryBuilder();
      });

      vi.mocked(createAdminClient).mockReturnValue({
        from: fromMock,
        storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
      } as unknown as ReturnType<typeof createAdminClient>);

      // No attachments → should hit the no-attachment path, not the whitelist block
      const res = await POST(makeRequest(BASE_PAYLOAD));
      expect(res.status).toBe(200);
      const blocked = mockSendEmail.mock.calls.find((c) =>
        (c[0] as { subject: string }).subject?.includes("not permitted")
      );
      expect(blocked).toBeUndefined();
    });
  });

  describe("no attachments path", () => {
    it("sends instructions email when no supported attachments", async () => {
      const fromMock = vi.fn((table: string) => {
        if (table === "users") return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: CLIENT_USER, error: null }) });
        if (table === "clients") return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: ORG, error: null }) });
        return makeQueryBuilder();
      });

      vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>);

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
      const fromMock = vi.fn((table: string) => {
        if (table === "users") return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: CLIENT_USER, error: null }) });
        if (table === "clients") return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: ORG, error: null }) });
        return makeQueryBuilder();
      });

      vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>);

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

  describe("new submission with PDF attachment → queued, not executed", () => {
    function makeMock() {
      const insert = vi.fn().mockResolvedValue({ data: null, error: null });
      const upload = vi.fn().mockResolvedValue({ error: null });
      const fromMock = vi.fn((table: string) => {
        if (table === "users") return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: CLIENT_USER, error: null }) });
        if (table === "clients") return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: ORG, error: null }) });
        if (table === "inbound_email_queue") return makeQueryBuilder({ insert });
        // "projects" and "templates" must NOT be queried under the hard gate.
        return makeQueryBuilder();
      });

      return {
        from: fromMock,
        storage: { from: vi.fn().mockReturnValue({ upload }) },
        insert,
        upload,
      };
    }

    it("queues the email instead of creating a draft project", async () => {
      const mock = makeMock();
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        Attachments: [
          { Name: "plans.pdf", Content: PDF_BASE64, ContentType: "application/pdf", ContentLength: 100 },
        ],
      };

      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      expect(mock.from).not.toHaveBeenCalledWith("projects");
      expect(mock.from).not.toHaveBeenCalledWith("templates");
      expect(mock.insert).toHaveBeenCalledOnce();
      expect(mock.insert.mock.calls[0][0]).toMatchObject({
        proposed_category: "new_submission",
        proposed_project_id: null,
        match_reason: "no_match",
        from_email: "client@example.com",
      });

      // Attachment uploaded to the pending-inbound bucket, not "submissions".
      expect(mock.upload).toHaveBeenCalledOnce();
      const [path] = mock.upload.mock.calls[0];
      expect(path).toMatch(/^[0-9a-f-]+\/plans\.pdf$/);

      // Holding reply, not "your draft is ready".
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "client@example.com", subject: expect.stringContaining("received") })
      );
    });
  });

  describe("thread reply via MailboxHash → queued, not executed", () => {
    const existingProjectId = "existing-proj-1";

    function makeMock(project: Record<string, unknown> | null) {
      const insert = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromMock = vi.fn((table: string) => {
        if (table === "users") return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: CLIENT_USER, error: null }) });
        if (table === "clients") return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: ORG, error: null }) });
        if (table === "projects") return makeQueryBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }) });
        if (table === "inbound_email_queue") return makeQueryBuilder({ insert });
        return makeQueryBuilder();
      });

      return {
        from: fromMock,
        storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
        insert,
      };
    }

    const PAYLOAD = {
      ...BASE_PAYLOAD,
      MailboxHash: existingProjectId,
      Attachments: [
        { Name: "extra-plans.pdf", Content: PDF_BASE64, ContentType: "application/pdf", ContentLength: 100 },
      ],
    };

    it("queues as thread_reply when the sender owns the draft", async () => {
      const mock = makeMock({
        id: existingProjectId,
        client_id: "org-1",
        status: "draft",
        submitted_by: "user-1", // matches CLIENT_USER.id
      });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(PAYLOAD));

      expect(res.status).toBe(200);
      expect(mock.insert).toHaveBeenCalledOnce();
      expect(mock.insert.mock.calls[0][0]).toMatchObject({
        proposed_category: "thread_reply",
        proposed_project_id: existingProjectId,
        match_reason: "mailbox_hash_projectid_match",
      });
    });

    it("#99: rejects a project-id match from a non-owning org member (different submitted_by)", async () => {
      const mock = makeMock({
        id: existingProjectId,
        client_id: "org-1", // same org as sender
        status: "draft",
        submitted_by: "someone-else-user-id", // not the sender
      });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(PAYLOAD));

      expect(res.status).toBe(200);
      expect(mock.insert).not.toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(
        "email.thread_reply_invalid",
        "user-1",
        "client@example.com",
        expect.anything()
      );
    });

    it("rejects a MailboxHash pointing to a non-draft project", async () => {
      const mock = makeMock({
        id: existingProjectId,
        client_id: "org-1",
        status: "submitted",
        submitted_by: "user-1",
      });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(PAYLOAD));

      expect(res.status).toBe(200);
      expect(mock.insert).not.toHaveBeenCalled();
      expect(mockAuditLog).toHaveBeenCalledWith(
        "email.thread_reply_invalid",
        expect.anything(),
        expect.anything(),
        expect.anything()
      );
    });
  });

  describe("stakeholder email reply token match → queued, not executed", () => {
    const TOKEN = "abc123reviewtoken";
    const REVIEW = {
      id: "review-1",
      project_id: "proj-1",
      status: "pending",
      expires_at: "2999-01-01T00:00:00Z",
    };

    it("queues as stakeholder_response and skips the sender-lookup gate entirely", async () => {
      mockValidateToken.mockResolvedValue({ review: REVIEW, isExpired: false });

      const insert = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromMock = vi.fn((table: string) => {
        if (table === "inbound_email_queue") return makeQueryBuilder({ insert });
        return makeQueryBuilder();
      });

      vi.mocked(createAdminClient).mockReturnValue({
        from: fromMock,
        storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
      } as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        From: "stakeholder@external.com",
        FromFull: { Email: "stakeholder@external.com", Name: "Sam Stakeholder", MailboxHash: TOKEN },
        MailboxHash: TOKEN,
        TextBody: "Looks good, approved from my end.",
      };

      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      // "users" table must never be queried — the token alone routes this.
      expect(fromMock).not.toHaveBeenCalledWith("users");
      expect(insert).toHaveBeenCalledOnce();
      expect(insert.mock.calls[0][0]).toMatchObject({
        proposed_category: "stakeholder_response",
        proposed_project_id: "proj-1",
        proposed_stakeholder_review_id: "review-1",
        match_reason: "token_match",
      });

      const bounced = mockSendEmail.mock.calls.some((c) =>
        (c[0] as { subject: string }).subject?.includes("Unrecognised")
      );
      expect(bounced).toBe(false);
    });

    it("#99: treats an expired token as no match — falls through instead of queuing a stakeholder_response", async () => {
      mockValidateToken.mockResolvedValue({
        review: { ...REVIEW, expires_at: "2000-01-01T00:00:00Z" },
        isExpired: true,
      });

      const insert = vi.fn().mockResolvedValue({ data: null, error: null });
      // Falls through to the ordinary sender-lookup gate — this sender has
      // no `users` row and no `stakeholders` match, so it bounces.
      const fromMock = vi.fn(() => makeQueryBuilder({ insert }));

      vi.mocked(createAdminClient).mockReturnValue({
        from: fromMock,
        storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
      } as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        From: "stakeholder@external.com",
        FromFull: { Email: "stakeholder@external.com", Name: "Sam Stakeholder", MailboxHash: TOKEN },
        MailboxHash: TOKEN,
      };

      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      expect(insert).not.toHaveBeenCalled();
      const bounced = mockSendEmail.mock.calls.some((c) =>
        (c[0] as { subject: string }).subject?.includes("Unrecognised")
      );
      expect(bounced).toBe(true);
    });

    it("#99: treats an already-acknowledged (non-pending) token as no match", async () => {
      mockValidateToken.mockResolvedValue({
        review: { ...REVIEW, status: "acknowledged" },
        isExpired: false,
      });

      const insert = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromMock = vi.fn(() => makeQueryBuilder({ insert }));

      vi.mocked(createAdminClient).mockReturnValue({
        from: fromMock,
        storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
      } as unknown as ReturnType<typeof createAdminClient>);

      const payload = {
        ...BASE_PAYLOAD,
        From: "stakeholder@external.com",
        FromFull: { Email: "stakeholder@external.com", Name: "Sam Stakeholder", MailboxHash: TOKEN },
        MailboxHash: TOKEN,
      };

      const res = await POST(makeRequest(payload));

      expect(res.status).toBe(200);
      expect(insert).not.toHaveBeenCalled();
    });
  });

  describe("non-client role", () => {
    it("returns 200 silently for consultant senders", async () => {
      const fromMock = vi.fn((table: string) => {
        if (table === "users")
          return makeQueryBuilder({ single: vi.fn().mockResolvedValue({ data: { ...CLIENT_USER, role: "consultant" }, error: null }) });
        return makeQueryBuilder();
      });

      vi.mocked(createAdminClient).mockReturnValue({ from: fromMock } as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(BASE_PAYLOAD));
      expect(res.status).toBe(200);
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
