import { describe, it, expect, vi, beforeEach } from "vitest";
import { runLoggedJob } from "./job-log";

const meta = { jobId: "job-1", projectId: "proj-1" };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("runLoggedJob", () => {
  it("logs success with job id, project and duration", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await expect(runLoggedJob("generate-pbdb", meta, async () => 42)).resolves.toBe(42);
    expect(log.mock.calls[0][0]).toMatch(
      /^\[job\] kind=generate-pbdb job=job-1 project=proj-1 outcome=success duration_ms=\d+$/
    );
  });

  it("logs failure and rethrows when the job throws", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runLoggedJob("pbdr-preview", meta, async () => {
        throw new Error("gotenberg down");
      })
    ).rejects.toThrow("gotenberg down");
    expect(error.mock.calls[0][0]).toContain("outcome=failure");
    expect(error.mock.calls[0][0]).toContain('error="gotenberg down"');
  });

  it("logs failure for a result the caller marks as failed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await runLoggedJob("pbdr-conversion", meta, async () => ({ success: false }), (r) => !r.success);
    expect(error.mock.calls[0][0]).toContain("kind=pbdr-conversion");
    expect(error.mock.calls[0][0]).toContain("outcome=failure");
  });
});
