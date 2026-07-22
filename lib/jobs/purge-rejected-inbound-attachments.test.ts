import { describe, it, expect, vi } from "vitest";

import { purgeRejectedInboundAttachments } from "./purge-rejected-inbound-attachments";

const NOW = new Date("2026-07-22T00:00:00Z");

function makeSupabase({
  entries,
  queryError = null,
  removeError = null,
}: {
  entries: { id: string; attachment_paths: { path: string }[] }[];
  queryError?: unknown;
  removeError?: unknown;
}) {
  const filters: [string, unknown][] = [];
  const removeMock = vi.fn().mockResolvedValue({ error: removeError });
  const storageFrom = vi.fn(() => ({ remove: removeMock }));

  const from = vi.fn((table: string) => {
    if (table !== "inbound_email_queue") throw new Error(`unexpected table: ${table}`);
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockImplementation((col: string, val: unknown) => {
        filters.push([col, val]);
        return {
          lt: vi.fn().mockImplementation((ltCol: string, ltVal: unknown) => {
            filters.push([ltCol, ltVal]);
            return Promise.resolve({ data: entries, error: queryError });
          }),
        };
      }),
    };
  });

  return { from, storage: { from: storageFrom }, removeMock, storageFrom, filters };
}

describe("purgeRejectedInboundAttachments", () => {
  it("removes attachments for rejected entries past the 30-day cutoff", async () => {
    const entries = [
      { id: "q1", attachment_paths: [{ path: "q1/a.pdf" }, { path: "q1/b.pdf" }] },
      { id: "q2", attachment_paths: [{ path: "q2/a.pdf" }] },
    ];
    const supabase = makeSupabase({ entries });

    const result = await purgeRejectedInboundAttachments(supabase as never, NOW);

    expect(result).toEqual({ purgedCount: 2, failedQueueIds: [] });
    expect(supabase.storageFrom).toHaveBeenCalledWith("pending-inbound");
    expect(supabase.removeMock).toHaveBeenCalledWith(["q1/a.pdf", "q1/b.pdf"]);
    expect(supabase.removeMock).toHaveBeenCalledWith(["q2/a.pdf"]);
    expect(supabase.filters).toContainEqual(["status", "rejected"]);
    expect(supabase.filters).toContainEqual(["resolved_at", new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()]);
  });

  it("skips entries with no attachments", async () => {
    const entries = [{ id: "q1", attachment_paths: [] }];
    const supabase = makeSupabase({ entries });

    const result = await purgeRejectedInboundAttachments(supabase as never, NOW);

    expect(result).toEqual({ purgedCount: 0, failedQueueIds: [] });
    expect(supabase.removeMock).not.toHaveBeenCalled();
  });

  it("collects failed queue ids without throwing on a single storage error", async () => {
    const entries = [{ id: "q1", attachment_paths: [{ path: "q1/a.pdf" }] }];
    const supabase = makeSupabase({ entries, removeError: { message: "boom" } });

    const result = await purgeRejectedInboundAttachments(supabase as never, NOW);

    expect(result).toEqual({ purgedCount: 0, failedQueueIds: ["q1"] });
  });

  it("throws when the queue query itself fails", async () => {
    const supabase = makeSupabase({ entries: [], queryError: { message: "query failed" } });

    await expect(purgeRejectedInboundAttachments(supabase as never, NOW)).rejects.toThrow("query failed");
  });
});
