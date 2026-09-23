import { describe, it, expect } from "vitest";
import { stepProgressPoll, PROGRESS_STALL_MS } from "./progress-poll";

describe("stepProgressPoll", () => {
  it("flags completion once when an in-flight value goes back to null", () => {
    const a = stepProgressPoll(null, 40, 0);
    const b = stepProgressPoll(a.state, 90, 1000);
    const c = stepProgressPoll(b.state, null, 2000);
    const d = stepProgressPoll(c.state, null, 3000);

    expect([a.completed, b.completed, c.completed, d.completed]).toEqual([false, false, true, false]);
  });

  it("does not flag completion when the first poll already sees null", () => {
    expect(stepProgressPoll(null, null, 0).completed).toBe(false);
  });

  it("reports stalled once the value has not changed for 90s", () => {
    const a = stepProgressPoll(null, 40, 0);
    const b = stepProgressPoll(a.state, 40, PROGRESS_STALL_MS - 1);
    const c = stepProgressPoll(b.state, 40, PROGRESS_STALL_MS);

    expect(b.stalled).toBe(false);
    expect(c.stalled).toBe(true);
  });

  it("resets the stall clock whenever the value changes", () => {
    const a = stepProgressPoll(null, 40, 0);
    const b = stepProgressPoll(a.state, 70, PROGRESS_STALL_MS);
    const c = stepProgressPoll(b.state, 70, PROGRESS_STALL_MS + 1000);

    expect(b.stalled).toBe(false);
    expect(c.stalled).toBe(false);
  });
});
