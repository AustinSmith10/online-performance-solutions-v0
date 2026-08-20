import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetSessionUser } = vi.hoisted(() => ({ mockGetSessionUser: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mockGetSessionUser }));

import { GET } from "./route";
import { startDownloadProgress, updateDownloadProgress } from "@/lib/downloads/download-progress";

function makeParams(dl: string) {
  return { params: Promise.resolve({ dl }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/download/pbdb/status/[dl]", () => {
  it("rejects when there is no session", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), makeParams("dl-1"));
    expect(res.status).toBe(401);
  });

  it("rejects an unauthorised role", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "s1", email: "s@x.com", role: "stakeholder" });
    const res = await GET(new Request("http://localhost"), makeParams("dl-1"));
    expect(res.status).toBe(401);
  });

  it("404s with a zeroed body for an unknown download id", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "admin-1", email: "a@x.com", role: "admin" });
    const res = await GET(new Request("http://localhost"), makeParams("unknown-dl"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ bytesServed: 0, totalBytes: null, done: false });
  });

  it("reports bytes served so far for an in-flight download", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "consultant-1", email: "c@x.com", role: "consultant" });
    startDownloadProgress("status-dl-1", 1000);
    updateDownloadProgress("status-dl-1", 300);

    const res = await GET(new Request("http://localhost"), makeParams("status-dl-1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bytesServed: 300, totalBytes: 1000, done: false });
  });
});
