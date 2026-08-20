import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  startDownloadProgress,
  updateDownloadProgress,
  completeDownloadProgress,
  getDownloadProgress,
} from "./download-progress";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("download-progress", () => {
  it("returns null for an unknown id", () => {
    expect(getDownloadProgress("unknown")).toBeNull();
  });

  it("tracks bytes served as they're reported", () => {
    startDownloadProgress("dl-1", 1000);
    expect(getDownloadProgress("dl-1")).toEqual({ bytesServed: 0, totalBytes: 1000, done: false });

    updateDownloadProgress("dl-1", 400);
    expect(getDownloadProgress("dl-1")).toEqual({ bytesServed: 400, totalBytes: 1000, done: false });

    completeDownloadProgress("dl-1");
    expect(getDownloadProgress("dl-1")).toEqual({ bytesServed: 1000, totalBytes: 1000, done: true });
  });

  it("supports an unknown total (no Content-Length upstream)", () => {
    startDownloadProgress("dl-2", null);
    updateDownloadProgress("dl-2", 250);
    expect(getDownloadProgress("dl-2")).toEqual({ bytesServed: 250, totalBytes: null, done: false });
  });

  it("ignores updates for an id that was never started", () => {
    updateDownloadProgress("ghost", 50);
    completeDownloadProgress("ghost");
    expect(getDownloadProgress("ghost")).toBeNull();
  });

  it("expires an abandoned in-flight entry after the TTL", () => {
    startDownloadProgress("dl-3", 1000);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(getDownloadProgress("dl-3")).toBeNull();
  });

  it("keeps a completed entry around briefly rather than expiring it instantly", () => {
    startDownloadProgress("dl-4", 1000);
    completeDownloadProgress("dl-4");
    vi.advanceTimersByTime(29 * 1000);
    expect(getDownloadProgress("dl-4")).not.toBeNull();
    vi.advanceTimersByTime(2 * 1000);
    expect(getDownloadProgress("dl-4")).toBeNull();
  });
});
