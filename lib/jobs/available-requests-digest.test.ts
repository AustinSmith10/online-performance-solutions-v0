import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email/sender");

import { sendAvailableRequestsDigest } from "./available-requests-digest";
import { sendEmail } from "@/lib/email/sender";

function makeSupabase({
  count,
  countError = null,
  queueCount = 0,
  queueCountError = null,
  recipients = [],
  recipientsError = null,
}: {
  count: number | null;
  countError?: unknown;
  queueCount?: number | null;
  queueCountError?: unknown;
  recipients?: { email: string | null }[];
  recipientsError?: unknown;
}) {
  const inMock = vi.fn().mockReturnThis();
  const eqCalls: [string, unknown][] = [];

  const from = vi.fn((table: string) => {
    if (table === "projects") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockImplementation(function (this: unknown) {
          return this;
        }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ count, error: countError }).then(resolve),
      };
    }
    if (table === "inbound_email_queue") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function (this: unknown) {
          return this;
        }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ count: queueCount, error: queueCountError }).then(resolve),
      };
    }
    if (table === "users") {
      return {
        select: vi.fn().mockReturnThis(),
        in: inMock,
        eq: vi.fn().mockImplementation((col: string, val: unknown) => {
          eqCalls.push([col, val]);
          return {
            then: (resolve: (v: unknown) => unknown) =>
              Promise.resolve({ data: recipients, error: recipientsError }).then(resolve),
          };
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });

  return { from, inMock, eqCalls };
}

beforeEach(() => {
  vi.mocked(sendEmail).mockReset();
  vi.mocked(sendEmail).mockResolvedValue(true);
});

describe("sendAvailableRequestsDigest", () => {
  it("suppresses the email when both the available count and queue count are 0", async () => {
    const supabase = makeSupabase({ count: 0, queueCount: 0 });
    const result = await sendAvailableRequestsDigest(supabase as never);
    expect(result).toEqual({ sent: false, count: 0, queueCount: 0, recipients: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends when the available count is 0 but the queue count is not", async () => {
    const recipients = [{ email: "consultant@example.com" }];
    const { from } = makeSupabase({ count: 0, queueCount: 2, recipients });
    const supabase = { from };
    const result = await sendAvailableRequestsDigest(supabase as never);
    expect(result).toEqual({ sent: true, count: 0, queueCount: 2, recipients: 1 });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("2 pending queue emails") })
    );
  });

  it("sends when the queue count is 0 but the available count is not", async () => {
    const recipients = [{ email: "consultant@example.com" }];
    const { from } = makeSupabase({ count: 3, queueCount: 0, recipients });
    const supabase = { from };
    const result = await sendAvailableRequestsDigest(supabase as never);
    expect(result).toEqual({ sent: true, count: 3, queueCount: 0, recipients: 1 });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ subject: expect.stringContaining("3 available requests") })
    );
  });

  it("sends to every active consultant/admin/super_admin when both counts are non-zero", async () => {
    const recipients = [
      { email: "consultant@example.com" },
      { email: "admin@example.com" },
      { email: "super@example.com" },
    ];
    const { from, inMock } = makeSupabase({ count: 3, queueCount: 4, recipients });
    const supabase = { from };
    const result = await sendAvailableRequestsDigest(supabase as never);

    expect(result).toEqual({ sent: true, count: 3, queueCount: 4, recipients: 3 });
    expect(inMock).toHaveBeenCalledWith("role", ["super_admin", "admin", "consultant"]);
    expect(sendEmail).toHaveBeenCalledTimes(3);
    for (const r of recipients) {
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: r.email,
          subject: "You have 3 available requests and 4 pending queue emails",
        })
      );
    }
  });

  it("filters out recipients with no email", async () => {
    const recipients = [{ email: "a@example.com" }, { email: null }];
    const { from } = makeSupabase({ count: 1, recipients });
    const supabase = { from };
    const result = await sendAvailableRequestsDigest(supabase as never);
    expect(result.recipients).toBe(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not send when the available-requests count query fails", async () => {
    const { from } = makeSupabase({ count: null, countError: { message: "boom" } });
    const supabase = { from };
    const result = await sendAvailableRequestsDigest(supabase as never);
    expect(result.sent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("treats a failed queue-count query as 0 rather than blocking the digest", async () => {
    const recipients = [{ email: "a@example.com" }];
    const { from } = makeSupabase({
      count: 5,
      queueCount: null,
      queueCountError: { message: "boom" },
      recipients,
    });
    const supabase = { from };
    const result = await sendAvailableRequestsDigest(supabase as never);
    expect(result).toEqual({ sent: true, count: 5, queueCount: 0, recipients: 1 });
  });
});
