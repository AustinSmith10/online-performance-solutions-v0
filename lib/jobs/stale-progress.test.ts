import { describe, it, expect, vi } from "vitest";
import { clearStaleProgress, STALE_PROGRESS_MS, type ProgressTracker } from "./stale-progress";

function makeSupabase(rows: { id: string; progress_pct: number }[]) {
  const updateEq2 = vi.fn().mockResolvedValue({ error: null });
  const updateEq1 = vi.fn().mockReturnValue({ eq: updateEq2 });
  const update = vi.fn().mockReturnValue({ eq: updateEq1 });
  const not = vi.fn().mockResolvedValue({ data: rows, error: null });
  const select = vi.fn().mockReturnValue({ not });
  return {
    client: { from: vi.fn().mockReturnValue({ select, update }) } as never,
    update,
    updateEq1,
    updateEq2,
  };
}

const idle = vi.fn().mockResolvedValue({ inFlight: false, actorId: "u-1" });

describe("clearStaleProgress", () => {
  it("does nothing on first sight of a value", async () => {
    const tracker: ProgressTracker = new Map();
    const sb = makeSupabase([{ id: "p1", progress_pct: 40 }]);

    const cleared = await clearStaleProgress(sb.client, tracker, idle, 0);

    expect(cleared).toEqual([]);
    expect(sb.update).not.toHaveBeenCalled();
    expect(tracker.get("p1")).toEqual({ pct: 40, since: 0 });
  });

  it("clears a value unchanged for STALE_PROGRESS_MS with no job in flight", async () => {
    const tracker: ProgressTracker = new Map([["p1", { pct: 40, since: 0 }]]);
    const sb = makeSupabase([{ id: "p1", progress_pct: 40 }]);

    const cleared = await clearStaleProgress(sb.client, tracker, idle, STALE_PROGRESS_MS);

    expect(cleared).toEqual([{ projectId: "p1", pct: 40, actorId: "u-1" }]);
    expect(sb.update).toHaveBeenCalledWith({ progress_pct: null });
    expect(sb.updateEq2).toHaveBeenCalledWith("progress_pct", 40);
    expect(tracker.has("p1")).toBe(false);
  });

  it("leaves it alone while a generate-pbdb job is still queued/active", async () => {
    const tracker: ProgressTracker = new Map([["p1", { pct: 40, since: 0 }]]);
    const sb = makeSupabase([{ id: "p1", progress_pct: 40 }]);
    const busy = vi.fn().mockResolvedValue({ inFlight: true, actorId: "u-1" });

    const cleared = await clearStaleProgress(sb.client, tracker, busy, STALE_PROGRESS_MS * 2);

    expect(cleared).toEqual([]);
    expect(sb.update).not.toHaveBeenCalled();
  });

  it("restarts the clock when the value moves", async () => {
    const tracker: ProgressTracker = new Map([["p1", { pct: 40, since: 0 }]]);
    const sb = makeSupabase([{ id: "p1", progress_pct: 70 }]);

    const cleared = await clearStaleProgress(sb.client, tracker, idle, STALE_PROGRESS_MS);

    expect(cleared).toEqual([]);
    expect(tracker.get("p1")).toEqual({ pct: 70, since: STALE_PROGRESS_MS });
  });

  it("forgets projects whose progress has since cleared", async () => {
    const tracker: ProgressTracker = new Map([["p1", { pct: 40, since: 0 }]]);
    const sb = makeSupabase([]);

    await clearStaleProgress(sb.client, tracker, idle, 1000);

    expect(tracker.size).toBe(0);
  });
});
