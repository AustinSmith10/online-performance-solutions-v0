import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/delivery/public-holidays");

import {
  generateTokenString,
  computeTokenExpiry,
  validateToken,
  hashToken,
  computeSignedUrlExpirySeconds,
} from "./tokens";
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

// ─── computeSignedUrlExpirySeconds (#161) ──────────────────────────────────────

describe("computeSignedUrlExpirySeconds", () => {
  beforeEach(() => {
    vi.mocked(getPublicHolidays).mockResolvedValue(new Set<string>());
  });

  it("defaults to 14 business days ahead (no holidays, starting Monday)", async () => {
    // Monday 2026-06-22 + 14 working days = Friday 2026-07-10
    const from = new Date("2026-06-22T00:00:00Z");
    const seconds = await computeSignedUrlExpirySeconds(from, null);
    const expiry = new Date(from.getTime() + seconds * 1000);
    expect(expiry.toISOString().slice(0, 10)).toBe("2026-07-10");
  });

  it("accounts for a public holiday inside the 14-business-day window", async () => {
    vi.mocked(getPublicHolidays).mockResolvedValue(new Set(["2026-06-23"])); // Tuesday is a holiday
    // Monday 2026-06-22 + 14 working days, with Tue 23rd a holiday, lands Monday 2026-07-13
    const from = new Date("2026-06-22T00:00:00Z");
    const seconds = await computeSignedUrlExpirySeconds(from, "NSW");
    const expiry = new Date(from.getTime() + seconds * 1000);
    expect(expiry.toISOString().slice(0, 10)).toBe("2026-07-13");
  });

  it("respects a custom businessDays argument", async () => {
    // Monday 2026-06-22 + 5 working days = Monday 2026-06-29 (same as the
    // approval token's own 5-day window, sanity-checking against a known value)
    const from = new Date("2026-06-22T00:00:00Z");
    const seconds = await computeSignedUrlExpirySeconds(from, null, 5);
    const expiry = new Date(from.getTime() + seconds * 1000);
    expect(expiry.toISOString().slice(0, 10)).toBe("2026-06-29");
  });

  it("fetches holidays for both years when the window spans a year boundary", async () => {
    // Dec 2026 + 14 business days crosses into January 2027.
    const from = new Date("2026-12-21T00:00:00Z");
    await computeSignedUrlExpirySeconds(from, "NSW");
    const fetchedYears = vi.mocked(getPublicHolidays).mock.calls.map((call) => call[1]);
    expect(fetchedYears).toContain(2026);
    expect(fetchedYears).toContain(2027);
  });

  it("does not fetch a second year when the window stays within one calendar year", async () => {
    const from = new Date("2026-03-02T00:00:00Z"); // Monday, plenty of room before year-end
    vi.mocked(getPublicHolidays).mockClear();
    await computeSignedUrlExpirySeconds(from, "NSW");
    const fetchedYears = vi.mocked(getPublicHolidays).mock.calls.map((call) => call[1]);
    expect(fetchedYears).toEqual([2026]);
  });
});

// ─── hashToken (#159) ─────────────────────────────────────────────────────────

describe("hashToken", () => {
  it("matches the well-known SHA-256 test vector for 'hello', lowercase hex", () => {
    // Confirms encoding/casing matches Postgres's encode(sha256('hello'::bytea), 'hex'),
    // which is the exact string this must agree with — see #134's backfill.
    expect(hashToken("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
  });

  it("is deterministic for the same input", () => {
    const token = "some-approval-token-string";
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });

  it("a token generated 'before' (hash computed by the SQL-equivalent path) validates identically to one generated 'after' (hash computed by this Node helper)", () => {
    // Simulates the #134 SQL backfill's encode(sha256(token::bytea), 'hex') by
    // computing the same digest via Node's crypto directly, independent of
    // hashToken's own implementation, then confirming they agree bit-for-bit.
    const preExistingToken = "pre-existing-plaintext-token-from-before-159";
    const sqlEquivalentHash = createHash("sha256").update(preExistingToken).digest("hex");
    expect(hashToken(preExistingToken)).toBe(sqlEquivalentHash);
  });
});

// ─── validateToken ────────────────────────────────────────────────────────────

function buildSupabaseMock(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  return { from: vi.fn().mockReturnValue(chain), chain };
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

  it("looks up by token_hash, not plaintext token (#159)", async () => {
    const mock = buildSupabaseMock({
      id: "review-1",
      expires_at: new Date(Date.now() + 1000).toISOString(),
    });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await validateToken("plaintext-token");

    expect(mock.chain.eq).toHaveBeenCalledWith("token_hash", hashToken("plaintext-token"));
    expect(mock.chain.eq).not.toHaveBeenCalledWith("token", expect.anything());
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
