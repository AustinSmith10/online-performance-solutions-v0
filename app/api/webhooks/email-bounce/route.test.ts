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

function makeSupabaseMock({
  sendLogRow = null,
  insertError = null,
}: {
  sendLogRow?: { project_id: string | null } | null;
  insertError?: { message: string } | null;
} = {}) {
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const from = vi.fn((table: string) => {
    if (table === "email_send_log") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: sendLogRow, error: null }),
      };
    }
    if (table === "bounce_events") {
      return { insert };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from, insert };
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
      expect(mock.insert).not.toHaveBeenCalled();
    });

    it("records a hard bounce as type 'bounce' and audits it", async () => {
      const mock = makeSupabaseMock({ sendLogRow: { project_id: "proj-1" } });
      vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>);

      const res = await POST(makeRequest(HARD_BOUNCE_PAYLOAD));

      expect(res.status).toBe(200);
      expect(mock.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "dead@example.com",
          project_id: "proj-1",
          type: "bounce",
          message_id: "msg-abc",
          reason: "HardBounce: The server was unable to deliver your message",
        })
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
      expect(mock.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "annoyed@example.com",
          project_id: null,
          type: "complaint",
        })
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
  });
});
