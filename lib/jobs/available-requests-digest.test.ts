import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/email/sender");

import { sendAvailableRequestsDigest } from "./available-requests-digest";
import { sendEmail } from "@/lib/email/sender";

function makeSupabase({
  count,
  countError = null,
  recipients = [],
  recipientsError = null,
}: {
  count: number | null;
  countError?: unknown;
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
  it("suppresses the email when the available count is 0", async () => {
    const supabase = makeSupabase({ count: 0 });
    const result = await sendAvailableRequestsDigest(supabase as never);
    expect(result).toEqual({ sent: false, count: 0, recipients: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends to every active consultant/admin/super_admin when count > 0", async () => {
    const recipients = [
      { email: "consultant@example.com" },
      { email: "admin@example.com" },
      { email: "super@example.com" },
    ];
    const { from, inMock } = makeSupabase({ count: 3, recipients });
    const supabase = { from };
    const result = await sendAvailableRequestsDigest(supabase as never);

    expect(result).toEqual({ sent: true, count: 3, recipients: 3 });
    expect(inMock).toHaveBeenCalledWith("role", ["super_admin", "admin", "consultant"]);
    expect(sendEmail).toHaveBeenCalledTimes(3);
    for (const r of recipients) {
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: r.email, subject: expect.stringContaining("3 available requests") })
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

  it("does not send when the count query fails", async () => {
    const { from } = makeSupabase({ count: null, countError: { message: "boom" } });
    const supabase = { from };
    const result = await sendAvailableRequestsDigest(supabase as never);
    expect(result.sent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
