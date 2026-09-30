import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockNotify } = vi.hoisted(() => ({ mockNotify: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/notifications/notify", () => ({ notify: mockNotify }));

import { sendClarificationReminders } from "./clarification-reminders";

const NOW = new Date("2026-09-30T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

type Row = {
  id: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  clarification_requested_at: string;
  clarification_expires_at: string | null;
  clarification_requested_by: string | null;
};
const row = (over: Partial<Row> = {}): Row => ({
  id: "q1",
  from_email: "sender@firm.com",
  from_name: "Sam Sender",
  subject: "Re: Approval",
  clarification_requested_at: daysAgo(4),
  clarification_expires_at: null,
  clarification_requested_by: "consultant-1",
  ...over,
});

function makeSupabase({
  rows,
  sentMarkers = [],
  markError = null,
  queryError = null,
}: {
  rows: Row[];
  sentMarkers?: { queue_id: string; stage: number }[];
  markError?: unknown;
  queryError?: unknown;
}) {
  const auditInsert = vi.fn().mockResolvedValue({ error: markError });
  const from = vi.fn((table: string) => {
    if (table === "inbound_email_queue") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockResolvedValue({ data: rows, error: queryError }),
      };
    }
    if (table === "audit_log") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: sentMarkers.map((m) => ({ metadata: m })), error: null }),
          }),
        }),
        insert: auditInsert,
      };
    }
    if (table === "users") {
      return { select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [{ id: "admin-1" }, { id: "consultant-1" }] }) }) };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return { client: { from } as never, auditInsert };
}

describe("sendClarificationReminders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does nothing before the first stage (3 days)", async () => {
    const { client, auditInsert } = makeSupabase({ rows: [row({ clarification_requested_at: daysAgo(2) })] });
    expect(await sendClarificationReminders(client, NOW)).toEqual({ reminded: 0, failedQueueIds: [] });
    expect(mockNotify).not.toHaveBeenCalled();
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("sends the stage 1 reminder once to the requester and each admin, in-app only", async () => {
    const { client, auditInsert } = makeSupabase({ rows: [row()] });
    const result = await sendClarificationReminders(client, NOW);

    expect(result.reminded).toBe(1);
    expect(auditInsert).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: "email_queue.clarification_reminder", metadata: { queue_id: "q1", stage: 1, age_days: 4 } })
    );
    // consultant-1 is both the requester and (in this mock) an admin: notified once.
    expect(mockNotify.mock.calls.map((c) => c[0].recipientId).sort()).toEqual(["admin-1", "consultant-1"]);
    expect(mockNotify.mock.calls[0][0]).toMatchObject({ type: "email_queue_clarification_unanswered", inAppOnly: true });
    expect(mockNotify.mock.calls[0][0].message).toContain("Sam Sender hasn't replied");
    expect(mockNotify.mock.calls[0][0].message).toContain("4 days");
  });

  it("does not repeat a stage that was already sent", async () => {
    const { client, auditInsert } = makeSupabase({ rows: [row()], sentMarkers: [{ queue_id: "q1", stage: 1 }] });
    expect((await sendClarificationReminders(client, NOW)).reminded).toBe(0);
    expect(auditInsert).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("sends stage 2 at 7 days even though stage 1 was sent", async () => {
    const { client, auditInsert } = makeSupabase({
      rows: [row({ clarification_requested_at: daysAgo(8) })],
      sentMarkers: [{ queue_id: "q1", stage: 1 }],
    });
    expect((await sendClarificationReminders(client, NOW)).reminded).toBe(1);
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({ metadata: { queue_id: "q1", stage: 2, age_days: 8 } }));
  });

  it("mentions an expired reply link", async () => {
    const { client } = makeSupabase({ rows: [row({ clarification_expires_at: daysAgo(1) })] });
    await sendClarificationReminders(client, NOW);
    expect(mockNotify.mock.calls[0][0].message).toContain("Their reply link has expired.");
  });

  it("does not notify, and reports the row, when the once-only marker can't be written", async () => {
    const { client } = makeSupabase({ rows: [row()], markError: { message: "db down" } });
    expect(await sendClarificationReminders(client, NOW)).toEqual({ reminded: 0, failedQueueIds: ["q1"] });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("still counts the reminder when one notification fails", async () => {
    mockNotify.mockRejectedValueOnce(new Error("nope"));
    const { client } = makeSupabase({ rows: [row()] });
    expect((await sendClarificationReminders(client, NOW)).reminded).toBe(1);
  });

  it("throws when the queue can't be read", async () => {
    const { client } = makeSupabase({ rows: [], queryError: { message: "boom" } });
    await expect(sendClarificationReminders(client, NOW)).rejects.toThrow("boom");
  });
});
