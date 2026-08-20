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

describe("GET /api/download/pbdr/status/[dl]", () => {
  it("rejects when there is no session", async () => {
    mockGetSessionUser.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), makeParams("dl-1"));
    expect(res.status).toBe(401);
  });

  it("allows a stakeholder to poll (pbdr downloads are stakeholder-accessible)", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "stakeholder-1", email: "s@x.com", role: "stakeholder" });
    startDownloadProgress("pbdr-status-1", 800);
    updateDownloadProgress("pbdr-status-1", 200);

    const res = await GET(new Request("http://localhost"), makeParams("pbdr-status-1"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ bytesServed: 200, totalBytes: 800, done: false });
  });

  it("404s with a zeroed body for an unknown download id", async () => {
    mockGetSessionUser.mockResolvedValue({ id: "admin-1", email: "a@x.com", role: "admin" });
    const res = await GET(new Request("http://localhost"), makeParams("unknown-pbdr-dl"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ bytesServed: 0, totalBytes: null, done: false });
  });
});
