import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockAuditLog } = vi.hoisted(() => ({
  mockAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit/log", () => ({ auditLog: mockAuditLog }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

import { createAdminClient } from "@/lib/supabase/admin";
import { POST } from "./route";
import { NextRequest } from "next/server";

const USER = "webhook-user";
const PASSWORD = "webhook-pass";

function makeRequest(body: unknown, auth = true): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/email-bounce", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

const HARD_BOUNCE_PAYLOAD = {
  Type: "HardBounce",
  MessageID: "msg-abc",
  Email: "dead@example.com",
  Description: "The server was unable to deliver your message",
};

const SPAM_COMPLAINT_PAYLOAD = {
  Type: "SpamComplaint",
  MessageID: "msg-def",
  Email: "annoyed@example.com",
  Description: "Feedback loop complaint",
};

// #150: the route now upserts with onConflict: "message_id,type" +
// ignoreDuplicates, then .select("id") to see whether a row actually landed
// — so the mock's "bounce_events" entry needs to support .upsert().select()
// rather than a plain .insert(). `insertedRows` defaults to a single row
// (the normal "this was a new event" case); pass [] to simulate a
// duplicate (message_id, type) pair that ignoreDuplicates suppressed.
function makeSupabaseMock({
  sendLogRow = null,
  insertError = null,
  insertedRows = [{ id: "be-1" }],
}: {
  sendLogRow?: { project_id: string | null } | null;
  insertError?: { message: string } | null;
  insertedRows?: { id: string }[] | null;
} = {}) {
  const select = vi.fn().mockResolvedValue({ data: insertedRows, error: insertError });
  const upsert = vi.fn().mockReturnValue({ select });
  const from = vi.fn((table: string) => {
    if (table === "email_send_log") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: sendLogRow, error: null }),
      };
    }
    if (table === "bounce_events") {
      return { upsert };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from, upsert, select };
}

describe("POST /api/webhooks/email-bounce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Basic Auth", () => {
    const ORIGINAL_USER = process.env.POSTMARK_BOUNCE_WEBHOOK_USER;
    const ORIGINAL_PASSWORD = process.env.POSTMARK_BOUNCE_WEBHOOK_PASSWORD;

    beforeEach(() => {
      process.env.POSTMARK_BOUNCE_WEBHOOK_USER = USER;
      process.env.POSTMARK_BOUNCE_WEBHOOK_PASSWORD = PASSWORD;
    });

    afterEach(() => {
      if (ORIGINAL_USER === undefined) delete process.env.POSTMARK_BOUNCE_WEBHOOK_USER;
      else process.env.POSTMARK_BOUNCE_WEBHOOK_USER = ORIGINAL_USER;
      if (ORIGINAL_PASSWORD === undefined) delete process.env.POSTMARK_BOUNCE_WEBHOOK_PASSWORD;
      else process.env.POSTMARK_BOUNCE_WEBHOOK_PASSWORD = ORIGINAL_PASSWORD;
    });

    it("returns 401 with no Authorization header", async () => {
      const res = await POST(makeRequest(HARD_BOUNCE_PAYLOAD, false));
      expect(res.status).toBe(401);
    });

    it("returns 401 with incorrect credentials", async () => {
      const req = new NextRequest("http://localhost/api/webhooks/email-bounce", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from("webhook-user:wrong-pass").toString("base64")}`,
        },
        body: JSON.stringify(HARD_BOUNCE_PAYLOAD),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe("with auth configured", () => {
    beforeEach(() => {
      process.env.POSTMARK_BOUNCE_WEBHOOK_USER = USER;
      process.env.POSTMARK_BOUNCE_WEBHOOK_PASSWORD = PASSWORD;
    });

    it("returns 200 for invalid JSON body without throwing", async () => {
      vi.mocked(createAdminClient).mockReturnValue({} as ReturnType<typeof createAdminClient>);
      const req = new NextRequest("http://localhost/api/webhooks/email-bounce", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString("base64")}`,
        },
        body: "not json{{",
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it("returns 200 and skips insert when Email is missing", async () => {
      const mock = makeSupabaseMock();
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest({ Type: "HardBounce", MessageID: "msg-abc" }));

      expect(res.status).toBe(200);
      expect(mock.upsert).not.toHaveBeenCalled();
    });

    it("records a hard bounce as type 'bounce' and audits it", async () => {
      const mock = makeSupabaseMock({ sendLogRow: { project_id: "proj-1" } });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(HARD_BOUNCE_PAYLOAD));

      expect(res.status).toBe(200);
      expect(mock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "dead@example.com",
          project_id: "proj-1",
          type: "bounce",
          message_id: "msg-abc",
          reason: "HardBounce: The server was unable to deliver your message",
        }),
        expect.objectContaining({ onConflict: "message_id,type", ignoreDuplicates: true })
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        "email.bounce_received",
        null,
        "dead@example.com",
        expect.objectContaining({ projectId: "proj-1" })
      );
    });

    it("records a spam complaint as type 'complaint' and audits it distinctly", async () => {
      const mock = makeSupabaseMock({ sendLogRow: null });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(SPAM_COMPLAINT_PAYLOAD));

      expect(res.status).toBe(200);
      expect(mock.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "annoyed@example.com",
          project_id: null,
          type: "complaint",
        }),
        expect.objectContaining({ onConflict: "message_id,type", ignoreDuplicates: true })
      );
      expect(mockAuditLog).toHaveBeenCalledWith(
        "email.complaint_received",
        null,
        "annoyed@example.com",
        expect.anything()
      );
    });

    it("still returns 200 when the bounce_events insert fails", async () => {
      const mock = makeSupabaseMock({ insertError: { message: "boom" } });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(HARD_BOUNCE_PAYLOAD));

      expect(res.status).toBe(200);
      expect(mockAuditLog).not.toHaveBeenCalled();
    });

    // #150: (message_id, type) is the dedupe key, not plain message_id — a
    // Bounce and a later SpamComplaint for the same MessageID must both be
    // recorded as distinct rows, and a genuine replay of the same event
    // must not be double-audited.
    describe("message_id + type dedupe (#150)", () => {
      it("skips the audit log when ignoreDuplicates suppressed the insert (replayed event)", async () => {
        const mock = makeSupabaseMock({ sendLogRow: { project_id: "proj-1" }, insertedRows: [] });
        vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

        const res = await POST(makeRequest(HARD_BOUNCE_PAYLOAD));

        expect(res.status).toBe(200);
        expect(mock.upsert).toHaveBeenCalledOnce();
        expect(mockAuditLog).not.toHaveBeenCalled();
      });

      it("uses (message_id, type) as the conflict target so a Bounce and a later SpamComplaint for the same MessageID both record and audit", async () => {
        // First delivery: a HardBounce for msg-shared.
        const bounceMock = makeSupabaseMock({ insertedRows: [{ id: "be-1" }] });
        vi.mocked(createAdminClient).mockReturnValue(bounceMock as unknown as ReturnType<typeof createAdminClient>);
        const res1 = await POST(makeRequest({ ...HARD_BOUNCE_PAYLOAD, MessageID: "msg-shared" }));
        expect(res1.status).toBe(200);
        expect(bounceMock.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ type: "bounce", message_id: "msg-shared" }),
          expect.objectContaining({ onConflict: "message_id,type" })
        );
        expect(mockAuditLog).toHaveBeenCalledWith("email.bounce_received", null, expect.anything(), expect.anything());

        vi.clearAllMocks();

        // Second delivery: a SpamComplaint for the SAME MessageID — distinct
        // `type`, so it's a different (message_id, type) pair and must still
        // insert + audit, not be swallowed as a duplicate of the bounce.
        const complaintMock = makeSupabaseMock({ insertedRows: [{ id: "be-2" }] });
        vi.mocked(createAdminClient).mockReturnValue(complaintMock as unknown as ReturnType<typeof createAdminClient>);
        const res2 = await POST(makeRequest({ ...SPAM_COMPLAINT_PAYLOAD, MessageID: "msg-shared" }));
        expect(res2.status).toBe(200);
        expect(complaintMock.upsert).toHaveBeenCalledWith(
          expect.objectContaining({ type: "complaint", message_id: "msg-shared" }),
          expect.objectContaining({ onConflict: "message_id,type" })
        );
        expect(mockAuditLog).toHaveBeenCalledWith("email.complaint_received", null, expect.anything(), expect.anything());
      });
    });
  });
});
