import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/stakeholders/resolver");
vi.mock("@/lib/stakeholders/tokens");
vi.mock("@/lib/payments/gate");
vi.mock("@/lib/payments/ledger");
vi.mock("@/lib/notifications/notify");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/email/sender");
vi.mock("@/lib/email/templates/ApprovalRequestEmail");
vi.mock("@/lib/email/templates/RevisionNoticeEmail");
vi.mock("@/lib/documents/pdf");

import { dispatchPbdb } from "./dispatch";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveStakeholders } from "@/lib/stakeholders/resolver";
import { generateTokenString, computeTokenExpiry } from "@/lib/stakeholders/tokens";
import { checkDispatchGate } from "@/lib/payments/gate";
import { logUpfront } from "@/lib/payments/ledger";
import { sendEmail } from "@/lib/email/sender";
import { renderApprovalRequestEmail } from "@/lib/email/templates/ApprovalRequestEmail";
import { renderRevisionNoticeEmail } from "@/lib/email/templates/RevisionNoticeEmail";
import { convertDocxToPdf } from "@/lib/documents/pdf";
import { auditLog } from "@/lib/audit/log";

const PROJECT_ID = "proj-abc";
const ORG_ID = "org-xyz";
const ACTOR_ID = "actor-1";
const SUBMITTER_ID = "submitter-1";

const BASE_PROJECT = {
  id: PROJECT_ID,
  client_id: ORG_ID,
  template_id: "tmpl-1",
  submitted_by: SUBMITTER_ID,
  status: "in_progress",
  review_cycle: 1,
  credit_deducted: false,
  project_number: "OPS-001",
  extracted_fields: {},
  clients: { state_territory: "NSW", payment_method: "upfront", name: "Acme" },
};

const SUBMITTER_USER = {
  email: "client@acme.com",
  first_name: "John",
  last_name: "Doe",
};

const ORG_STAKEHOLDERS = [
  { id: "s-1", name: "Planner", email: "planner@council.gov", company: "Council" },
];

/** Makes a thenable chain that always resolves to { data, error }. */
function chain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error });
  const self = () => obj;
  obj.select = self; obj.eq = self; obj.order = self; obj.limit = self; obj.not = self; obj.in = self;
  obj.single = resolve; obj.maybeSingle = resolve;
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  obj.catch = () => obj;
  return obj;
}

function buildSupabaseMock(priorAcknowledged: unknown[] = []) {
  const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const calls: Record<string, number> = {};

  const storage = {
    from: vi.fn().mockReturnValue({
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: null }, error: null }),
    }),
  };

  return {
    from: vi.fn((table: string) => {
      calls[table] = (calls[table] ?? 0) + 1;
      const n = calls[table];

      if (table === "projects") {
        return n === 1
          ? { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: BASE_PROJECT, error: null }) }
          : { update: vi.fn().mockReturnValue(chain(null)) };
      }

      if (table === "users") {
        // n=1: submitter lookup via .eq("id", ...).maybeSingle()
        // n=2: portal user map lookup via .in("email", [...]) — returns empty list by default
        if (n === 1) return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: SUBMITTER_USER, error: null }) };
        return chain([]);
      }

      if (table === "project_files") return chain(null);

      if (table === "stakeholder_reviews") {
        // First call (cycle > 1 only): select prior-cycle acknowledged rows
        if (n === 1 && priorAcknowledged.length > 0) return chain(priorAcknowledged);
        // Remaining calls: upsert for each stakeholder
        return { upsert: upsertFn };
      }

      return chain(null);
    }),
    storage,
    upsertFn,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(checkDispatchGate).mockResolvedValue({ allowed: true });
  vi.mocked(logUpfront).mockResolvedValue(undefined);
  vi.mocked(generateTokenString).mockReturnValue("mock-token-123");
  vi.mocked(computeTokenExpiry).mockResolvedValue(new Date("2026-06-30T00:00:00Z"));
  vi.mocked(renderApprovalRequestEmail).mockReturnValue("<html>approval</html>");
  vi.mocked(renderRevisionNoticeEmail).mockReturnValue("<html>notice</html>");
  vi.mocked(sendEmail).mockResolvedValue(undefined);
  vi.mocked(resolveStakeholders).mockResolvedValue(ORG_STAKEHOLDERS);
});

describe("dispatchPbdb — submitting client inclusion", () => {
  it("includes the submitting client in the dispatch even when not in the stakeholder list", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildSupabaseMock() as never);

    await dispatchPbdb(PROJECT_ID, ACTOR_ID);

    const calls = vi.mocked(sendEmail).mock.calls;
    const recipients = calls.map((c) => c[0].to);
    expect(recipients).toContain("client@acme.com");
  });

  it("sends approval email to all org stakeholders", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildSupabaseMock() as never);

    await dispatchPbdb(PROJECT_ID, ACTOR_ID);

    const recipients = vi.mocked(sendEmail).mock.calls.map((c) => c[0].to);
    expect(recipients).toContain("planner@council.gov");
  });

  it("does not duplicate the client when their email is already in the stakeholder list", async () => {
    vi.mocked(resolveStakeholders).mockResolvedValue([
      { id: "s-1", name: "John Doe", email: "client@acme.com", company: null },
    ]);
    vi.mocked(createAdminClient).mockReturnValue(buildSupabaseMock() as never);

    await dispatchPbdb(PROJECT_ID, ACTOR_ID);

    const recipients = vi.mocked(sendEmail).mock.calls.map((c) => c[0].to);
    const clientEmails = recipients.filter((r) => r === "client@acme.com");
    expect(clientEmails).toHaveLength(1);
  });

  it("client email is sent before other stakeholders (prepended)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildSupabaseMock() as never);

    await dispatchPbdb(PROJECT_ID, ACTOR_ID);

    const recipients = vi.mocked(sendEmail).mock.calls.map((c) => c[0].to);
    expect(recipients[0]).toBe("client@acme.com");
  });

  it("throws when no stakeholders configured and submitter cannot be resolved", async () => {
    vi.mocked(resolveStakeholders).mockResolvedValue([]);
    const mock = buildSupabaseMock();
    // Override users to return null (submitter not found)
    const origFrom = mock.from as ReturnType<typeof vi.fn>;
    origFrom.mockImplementation((table: string) => {
      if (table === "users") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }
      if (table === "projects") {
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: BASE_PROJECT, error: null }) };
      }
      return chain(null);
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(dispatchPbdb(PROJECT_ID, ACTOR_ID)).rejects.toThrow("No stakeholders");
  });

  it("creates a stakeholder_reviews row for each dispatched stakeholder", async () => {
    const mock = buildSupabaseMock();
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await dispatchPbdb(PROJECT_ID, ACTOR_ID);

    // client + 1 org stakeholder = 2 upsert calls
    expect(mock.upsertFn).toHaveBeenCalledTimes(2);
  });
});

describe("dispatchPbdb — stakeholder-facing artifact is a PDF, never the docx", () => {
  it("converts the current PBDB docx to PDF and dispatches the PDF link, not the docx", async () => {
    const docxRow = {
      storage_path: `${ORG_ID}/${PROJECT_ID}/pbdb/v1_OPS-001-S PBDB R0.docx`,
      original_filename: "OPS-001-S PBDB R0.docx",
      version: 1,
    };
    const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const uploadFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const downloadFn = vi.fn().mockResolvedValue({
      data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
      error: null,
    });
    const createSignedUrlFn = vi
      .fn()
      .mockResolvedValue({ data: { signedUrl: "https://signed/pdf" }, error: null });

    const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });
    let pfCalls = 0;

    const mock = {
      from: vi.fn((table: string) => {
        if (table === "projects") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: BASE_PROJECT, error: null }),
            update: vi.fn().mockReturnValue(chain(null)),
          };
        }
        if (table === "users") {
          return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: SUBMITTER_USER, error: null }), in: vi.fn().mockResolvedValue({ data: [], error: null }) };
        }
        if (table === "project_files") {
          pfCalls++;
          // 1st call: pbdb_pdf cache lookup — nothing cached yet.
          if (pfCalls === 1) {
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) };
          }
          // 2nd call: source pbdb docx lookup — found.
          if (pfCalls === 2) {
            return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: docxRow, error: null }) };
          }
          // 3rd call: insert the newly-created pbdb_pdf row.
          return { insert: insertFn };
        }
        if (table === "stakeholder_reviews") return { upsert: upsertFn };
        return chain(null);
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          download: downloadFn,
          upload: uploadFn,
          createSignedUrl: createSignedUrlFn,
        }),
      },
    };

    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    vi.mocked(convertDocxToPdf).mockResolvedValue(Buffer.from("pdf-bytes"));

    await dispatchPbdb(PROJECT_ID, ACTOR_ID);

    const expectedPdfPath = `${ORG_ID}/${PROJECT_ID}/pbdb/v1_OPS-001-S PBDB R0.pdf`;

    expect(vi.mocked(convertDocxToPdf)).toHaveBeenCalled();
    expect(uploadFn).toHaveBeenCalledWith(
      expectedPdfPath,
      expect.anything(),
      { contentType: "application/pdf" }
    );
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ file_type: "pbdb_pdf", storage_path: expectedPdfPath })
    );
    // The emailed link must point at the PDF path, never the raw docx path.
    expect(createSignedUrlFn).toHaveBeenCalledWith(expectedPdfPath, 7 * 24 * 3600);
    expect(createSignedUrlFn).not.toHaveBeenCalledWith(docxRow.storage_path, expect.anything());
  });
});

describe("dispatchPbdb — revision cycle notice", () => {
  it("sends revision notices to prior-cycle acknowledged stakeholders on cycle 2", async () => {
    const cycle2Project = { ...BASE_PROJECT, review_cycle: 2 };
    const priorAcknowledged = [
      { stakeholder_email: "planner@council.gov", stakeholder_name: "Planner", status: "approved_without_comments" },
    ];
    const upsertFn = vi.fn().mockResolvedValue({ data: null, error: null });
    const calls: Record<string, number> = {};

    const mock = {
      from: vi.fn((table: string) => {
        calls[table] = (calls[table] ?? 0) + 1;
        const n = calls[table];
        if (table === "projects") {
          return n === 1
            ? { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: cycle2Project, error: null }) }
            : { update: vi.fn().mockReturnValue(chain(null)) };
        }
        if (table === "users") {
          if (n === 1) return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: SUBMITTER_USER, error: null }) };
          return chain([]);
        }
        if (table === "project_files") return chain(null);
        if (table === "stakeholder_reviews") {
          // n=1: select prior-cycle acknowledged rows
          if (n === 1) return chain(priorAcknowledged);
          // n=2+: upsert for each new-cycle stakeholder
          return { upsert: upsertFn };
        }
        return chain(null);
      }),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: null }, error: null }) }) },
    };

    vi.mocked(createAdminClient).mockReturnValue(mock as never);
    await dispatchPbdb(PROJECT_ID, ACTOR_ID);

    expect(vi.mocked(renderRevisionNoticeEmail)).toHaveBeenCalled();
  });

  it("does not send revision notices on cycle 1 (first dispatch)", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildSupabaseMock() as never);

    await dispatchPbdb(PROJECT_ID, ACTOR_ID);

    expect(vi.mocked(renderRevisionNoticeEmail)).not.toHaveBeenCalled();
  });
});

describe("dispatchPbdb — payment gate", () => {
  it("blocks dispatch and notifies admins when gate is closed", async () => {
    vi.mocked(checkDispatchGate).mockResolvedValue({ allowed: false, reason: "Insufficient credit" });

    const mock = buildSupabaseMock();
    // Make users return admin list
    (mock.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      if (table === "projects") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: BASE_PROJECT, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(dispatchPbdb(PROJECT_ID, ACTOR_ID)).rejects.toThrow("Dispatch blocked");
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("skips payment gate check when credit_deducted is already true", async () => {
    const alreadyDeducted = { ...BASE_PROJECT, credit_deducted: true };
    const mock = buildSupabaseMock();
    const origFrom = mock.from as ReturnType<typeof vi.fn>;
    let projCalls = 0;
    let usersCalls = 0;
    origFrom.mockImplementation((table: string) => {
      if (table === "projects") {
        projCalls++;
        if (projCalls === 1) return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: alreadyDeducted, error: null }) };
        return { update: vi.fn().mockReturnValue(chain(null)) };
      }
      if (table === "users") {
        usersCalls++;
        if (usersCalls === 1) return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: SUBMITTER_USER, error: null }) };
        return chain([]);
      }
      if (table === "project_files") return chain(null);
      if (table === "stakeholder_reviews") return { upsert: mock.upsertFn };
      return chain(null);
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await dispatchPbdb(PROJECT_ID, ACTOR_ID);

    expect(vi.mocked(checkDispatchGate)).not.toHaveBeenCalled();
  });
});

describe("dispatchPbdb — audit trail records who the review was sent to", () => {
  it("logs project.pbdb_dispatched with the name and email of every recipient, including the prepended client", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildSupabaseMock() as never);

    await dispatchPbdb(PROJECT_ID, ACTOR_ID);

    expect(vi.mocked(auditLog)).toHaveBeenCalledWith(
      "project.pbdb_dispatched",
      ACTOR_ID,
      null,
      expect.objectContaining({
        metadata: expect.objectContaining({
          stakeholder_count: 2,
          stakeholders: expect.arrayContaining([
            { name: "Planner", email: "planner@council.gov" },
            { name: "John Doe", email: "client@acme.com" },
          ]),
        }),
      })
    );
  });
});
