import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/delivery/public-holidays");

import { generateTokenString, computeTokenExpiry, validateToken } from "./tokens";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPublicHolidays } from "@/lib/delivery/public-holidays";

// ─── generateTokenString ──────────────────────────────────────────────────────

describe("generateTokenString", () => {
  it("returns a non-empty string", () => {
    expect(typeof generateTokenString()).toBe("string");
    expect(generateTokenString().length).toBeGreaterThan(0);
  });

  it("returns only base64url-safe characters", () => {
    const token = generateTokenString();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a different value on each call", () => {
    const tokens = new Set(Array.from({ length: 20 }, generateTokenString));
    expect(tokens.size).toBe(20);
  });

  it("is at least 40 characters long (256-bit entropy)", () => {
    expect(generateTokenString().length).toBeGreaterThanOrEqual(40);
  });
});

// ─── computeTokenExpiry ───────────────────────────────────────────────────────

describe("computeTokenExpiry", () => {
  beforeEach(() => {
    vi.mocked(getPublicHolidays).mockResolvedValue(new Set<string>());
  });

  it("returns a Date in the future", async () => {
    const now = new Date("2026-06-18T10:00:00Z");
    const expiry = await computeTokenExpiry(now, null);
    expect(expiry.getTime()).toBeGreaterThan(now.getTime());
  });

  it("sets expiry to 5 working days ahead (no holidays, starting Monday)", async () => {
    // Monday 2026-06-22 + 5 working days = Monday 2026-06-29
    const dispatched = new Date("2026-06-22T00:00:00Z");
    const expiry = await computeTokenExpiry(dispatched, null);
    expect(expiry.toISOString().slice(0, 10)).toBe("2026-06-29");
  });

  it("skips weekends when computing expiry", async () => {
    // Friday 2026-06-19 + 5 working days = Friday 2026-06-26
    const dispatched = new Date("2026-06-19T00:00:00Z");
    const expiry = await computeTokenExpiry(dispatched, null);
    expect(expiry.toISOString().slice(0, 10)).toBe("2026-06-26");
  });

  it("skips public holidays when computing expiry", async () => {
    vi.mocked(getPublicHolidays).mockResolvedValue(new Set(["2026-06-23"])); // Tuesday is a holiday
    // Monday 2026-06-22 + 5 working days: Tue is holiday, so lands on Tuesday 2026-06-30
    const dispatched = new Date("2026-06-22T00:00:00Z");
    const expiry = await computeTokenExpiry(dispatched, "NSW");
    expect(expiry.toISOString().slice(0, 10)).toBe("2026-06-30");
  });
});

// ─── validateToken ────────────────────────────────────────────────────────────

function buildSupabaseMock(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  return { from: vi.fn().mockReturnValue(chain) };
}

describe("validateToken", () => {
  it("returns null when the token is not found", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildSupabaseMock(null) as never);
    const result = await validateToken("nonexistent-token");
    expect(result).toBeNull();
  });

  it("returns null when supabase returns an error", async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildSupabaseMock(null, { message: "db error" }) as never
    );
    const result = await validateToken("any-token");
    expect(result).toBeNull();
  });

  it("returns the review with isExpired=false for a valid non-expired token", async () => {
    const futureExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const review = {
      id: "review-1",
      token: "valid-token",
      expires_at: futureExpiry,
      status: "pending",
      stakeholder_email: "jane@example.com",
      stakeholder_name: "Jane",
      project_id: "proj-1",
      review_cycle: 1,
    };
    vi.mocked(createAdminClient).mockReturnValue(buildSupabaseMock(review) as never);

    const result = await validateToken("valid-token");
    expect(result).not.toBeNull();
    expect(result!.isExpired).toBe(false);
    expect(result!.review.id).toBe("review-1");
  });

  it("returns isExpired=true when the token expiry is in the past", async () => {
    const pastExpiry = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const review = {
      id: "review-2",
      token: "expired-token",
      expires_at: pastExpiry,
      status: "pending",
      stakeholder_email: "bob@example.com",
      stakeholder_name: "Bob",
      project_id: "proj-1",
      review_cycle: 1,
    };
    vi.mocked(createAdminClient).mockReturnValue(buildSupabaseMock(review) as never);

    const result = await validateToken("expired-token");
    expect(result).not.toBeNull();
    expect(result!.isExpired).toBe(true);
  });
});
