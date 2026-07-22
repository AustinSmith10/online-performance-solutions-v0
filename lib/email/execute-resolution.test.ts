import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSendEmail, mockAuditLog, mockNotify, mockExtractDocumentFields, mockResolveStakeholders } = vi.hoisted(() => ({
  mockSendEmail: vi.fn().mockResolvedValue(true),
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
  mockNotify: vi.fn().mockResolvedValue(undefined),
  mockExtractDocumentFields: vi.fn(),
  mockResolveStakeholders: vi.fn().mockResolvedValue([]),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/sender", () => ({ sendEmail: mockSendEmail }));
vi.mock("@/lib/audit/log", () => ({ auditLog: mockAuditLog }));
vi.mock("@/lib/notifications/notify", () => ({ notify: mockNotify }));
vi.mock("@/lib/documents/extractor", () => ({ extractDocumentFields: mockExtractDocumentFields }));
vi.mock("@/lib/stakeholders/resolver", () => ({ resolveStakeholders: mockResolveStakeholders }));

import { executeQueueRowResolution, type QueueRowForExecution } from "./execute-resolution";

const EMPTY_EXTRACTION = {
  po_number: { value: "", confidence: "low" },
  fields: {},
  candidates: {},
};

function makeRow(overrides: Partial<QueueRowForExecution> = {}): QueueRowForExecution {
  return {
    id: "queue-1",
    from_email: "client@example.com",
    from_name: "Jane Client",
    subject: "Report request",
    message_id: "msg-1",
    mailbox_hash: null,
    text_body: "See attached.",
    stripped_reply_text: null,
    received_at: "2026-07-22T09:00:00Z",
    attachment_paths: [],
    ...overrides,
  };
}

// Minimal chainable query-builder mock, driven by table name.
function makeQueryBuilder(overrides: Record<string, unknown> = {}) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    // Chainable so `.insert(x)` awaited directly AND `.insert(x).select().single()`
    // (archiveInboundEmailAsEvidence) both work against the same default mock.
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: "evidence-file-1" }, error: null }) }),
    }),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  };
}

describe("executeQueueRowResolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExtractDocumentFields.mockResolvedValue(EMPTY_EXTRACTION);
    mockResolveStakeholders.mockResolvedValue([]);
  });

  describe("new_submission", () => {
    function makeSupabase(overrides: { userFound?: boolean } = {}) {
      const insertProject = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: "proj-new" }, error: null }),
      });

      const fromMock = vi.fn((table: string) => {
        if (table === "users") {
          return makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({
              data: overrides.userFound === false
                ? null
                : { id: "user-1", email: "client@example.com", client_id: "org-1", role: "stakeholder" },
              error: null,
            }),
          });
        }
        if (table === "clients") {
          return makeQueryBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "org-1", name: "Stockland" }, error: null }) });
        }
        if (table === "templates") return makeQueryBuilder();
        if (table === "projects") return makeQueryBuilder({ insert: insertProject });
        return makeQueryBuilder();
      });

      return {
        from: fromMock,
        storage: { from: vi.fn().mockReturnValue({ download: vi.fn(), upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({ error: null }) }) },
      };
    }

    it("creates a draft project and sends the portal-link email", async () => {
      const supabase = makeSupabase();
      const row = makeRow();

      const result = await executeQueueRowResolution(row, { category: "new_submission" }, supabase as never);

      expect(result.ok).toBe(true);
      expect(result.projectId).toBe("proj-new");
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "client@example.com", subject: expect.stringContaining("draft is ready") })
      );
      expect(mockAuditLog).toHaveBeenCalledWith("email.draft_created", "user-1", "client@example.com", expect.anything());
    });

    it("returns an error when the sender has no client user account", async () => {
      const supabase = makeSupabase({ userFound: false });
      const row = makeRow();

      const result = await executeQueueRowResolution(row, { category: "new_submission" }, supabase as never);

      expect(result.ok).toBe(false);
      expect(result.error).toBeTruthy();
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe("thread_reply", () => {
    function makeSupabase(project: Record<string, unknown> | null) {
      const insertFiles = vi.fn().mockResolvedValue({ data: null, error: null });
      const fromMock = vi.fn((table: string) => {
        if (table === "projects")
          return makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }),
            single: vi.fn().mockResolvedValue({ data: { extracted_fields: null, po_number: null }, error: null }),
          });
        if (table === "project_files") return makeQueryBuilder({ insert: insertFiles });
        return makeQueryBuilder();
      });

      return {
        from: fromMock,
        storage: {
          from: vi.fn().mockReturnValue({
            download: vi.fn().mockResolvedValue({
              data: { arrayBuffer: async () => Buffer.from("%PDF-1.4").buffer },
              error: null,
            }),
            upload: vi.fn().mockResolvedValue({ error: null }),
            remove: vi.fn().mockResolvedValue({ error: null }),
          }),
        },
        insertFiles,
      };
    }

    const ROW_WITH_ATTACHMENT = makeRow({
      attachment_paths: [{ path: "queue-1/extra-plans.pdf", filename: "extra-plans.pdf", content_type: "application/pdf" }],
    });

    it("rejects a non-draft project", async () => {
      const supabase = makeSupabase({ id: "proj-1", client_id: "org-1", status: "submitted", template_id: null, submitted_by: "user-1" });

      const result = await executeQueueRowResolution(ROW_WITH_ATTACHMENT, { category: "thread_reply", projectId: "proj-1" }, supabase as never);

      expect(result.ok).toBe(false);
    });

    it("rejects when the project doesn't exist", async () => {
      const supabase = makeSupabase(null);

      const result = await executeQueueRowResolution(ROW_WITH_ATTACHMENT, { category: "thread_reply", projectId: "missing" }, supabase as never);

      expect(result.ok).toBe(false);
    });

    it("files the attachment against a draft project and audits", async () => {
      const supabase = makeSupabase({ id: "proj-1", client_id: "org-1", status: "draft", template_id: null, submitted_by: "user-1" });

      const result = await executeQueueRowResolution(ROW_WITH_ATTACHMENT, { category: "thread_reply", projectId: "proj-1" }, supabase as never);

      expect(result.ok).toBe(true);
      expect(supabase.insertFiles).toHaveBeenCalledWith(
        expect.objectContaining({ project_id: "proj-1", uploaded_by: "user-1", file_type: "building_drawing_plans" })
      );
      expect(mockAuditLog).toHaveBeenCalledWith("email.thread_attachments_added", "user-1", "client@example.com", expect.anything());
    });

    it("is a no-op success when the row has no attachments", async () => {
      const supabase = makeSupabase({ id: "proj-1", client_id: "org-1", status: "draft", template_id: null, submitted_by: "user-1" });

      const result = await executeQueueRowResolution(makeRow(), { category: "thread_reply", projectId: "proj-1" }, supabase as never);

      expect(result.ok).toBe(true);
      expect(mockAuditLog).not.toHaveBeenCalled();
    });
  });

  describe("stakeholder_response", () => {
    const REVIEW = { id: "review-1", project_id: "proj-1", stakeholder_email: "stakeholder@external.com", stakeholder_name: "Sam Stakeholder" };
    const PROJECT = {
      id: "proj-1",
      client_id: "org-1",
      submitted_by: "user-1",
      assigned_consultant_id: "consultant-1",
      qa_completed_by: null,
      extracted_fields: null,
      project_number: "PN-1",
    };

    function makeSupabase({ review = REVIEW, project = PROJECT, senderKnown = true }: { review?: typeof REVIEW | null; project?: typeof PROJECT | null; senderKnown?: boolean } = {}) {
      const reviewUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: null, error: null }) });
      mockResolveStakeholders.mockResolvedValue(
        senderKnown ? [{ id: "s1", name: "Sam Stakeholder", email: "stakeholder@external.com", company: null }] : []
      );

      const fromMock = vi.fn((table: string) => {
        if (table === "stakeholder_reviews")
          return makeQueryBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: review, error: null }), update: reviewUpdate });
        if (table === "projects") return makeQueryBuilder({ maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }) });
        if (table === "users")
          return makeQueryBuilder({
            maybeSingle: vi.fn().mockResolvedValue({ data: { email: "submitter@example.com" }, error: null }),
            in: vi.fn().mockResolvedValue({ data: [{ id: "admin-1" }] }),
          });
        return makeQueryBuilder();
      });

      return {
        from: fromMock,
        storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
        reviewUpdate,
      };
    }

    it("marks the reply verified when the sender is on the roster", async () => {
      const supabase = makeSupabase({ senderKnown: true });
      const row = makeRow({ from_email: "stakeholder@external.com" });

      const result = await executeQueueRowResolution(row, { category: "stakeholder_response", stakeholderReviewId: "review-1" }, supabase as never);

      expect(result.ok).toBe(true);
      expect(supabase.reviewUpdate).toHaveBeenCalledWith(expect.objectContaining({ email_reply_sender_verified: true }));
    });

    it("marks the reply unverified when the sender is not on the roster (e.g. after a reassign to a different project)", async () => {
      const supabase = makeSupabase({ senderKnown: false });
      const row = makeRow({ from_email: "unrelated@example.com" });

      const result = await executeQueueRowResolution(row, { category: "stakeholder_response", stakeholderReviewId: "review-1" }, supabase as never);

      expect(result.ok).toBe(true);
      expect(supabase.reviewUpdate).toHaveBeenCalledWith(expect.objectContaining({ email_reply_sender_verified: false }));
    });

    it("returns an error when the target review cycle doesn't exist", async () => {
      const supabase = makeSupabase({ review: null });
      const row = makeRow();

      const result = await executeQueueRowResolution(row, { category: "stakeholder_response", stakeholderReviewId: "missing" }, supabase as never);

      expect(result.ok).toBe(false);
    });

    it("returns an error when the review's project can't be found", async () => {
      const supabase = makeSupabase({ project: null });
      const row = makeRow();

      const result = await executeQueueRowResolution(row, { category: "stakeholder_response", stakeholderReviewId: "review-1" }, supabase as never);

      expect(result.ok).toBe(false);
      expect(mockAuditLog).toHaveBeenCalledWith("email.stakeholder_reply_invalid", null, row.from_email, expect.anything());
    });
  });
});
