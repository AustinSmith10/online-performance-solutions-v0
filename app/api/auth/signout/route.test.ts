import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server");

import { GET } from "./route";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { NextRequest } from "next/server";

function makeRequest(next?: string): NextRequest {
  const url = next
    ? `http://localhost/api/auth/signout?next=${encodeURIComponent(next)}`
    : "http://localhost/api/auth/signout";
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createServerClient).mockResolvedValue({
    auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
  } as never);
});

describe("GET /api/auth/signout — open redirect guard", () => {
  it("falls back to /login for an absolute off-site next", async () => {
    const response = await GET(makeRequest("https://evil.example"));
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost/login");
  });

  it("falls back to /login for a protocol-relative next", async () => {
    const response = await GET(makeRequest("//evil.example"));
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost/login");
  });

  it("falls back to /login for a backslash-based next", async () => {
    const response = await GET(makeRequest("/\\evil.example"));
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost/login");
  });

  it("passes through a legitimate relative next", async () => {
    const response = await GET(makeRequest("/ops/projects/123"));
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost/login?next=%2Fops%2Fprojects%2F123");
  });

  it("defaults to /login when no next is supplied", async () => {
    const response = await GET(makeRequest());
    const location = response.headers.get("location");
    expect(location).toBe("http://localhost/login");
  });
});
