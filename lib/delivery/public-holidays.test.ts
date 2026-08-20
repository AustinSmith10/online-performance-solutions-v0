import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");

import { getPublicHolidays } from "./public-holidays";
import { createAdminClient } from "@/lib/supabase/admin";

function buildSupabaseMock({
  cached,
}: {
  cached: { holidays: string[]; fetched_at: string } | null;
}) {
  const upsert = vi.fn().mockResolvedValue({ data: null, error: null });
  const maybeSingle = vi.fn().mockResolvedValue({ data: cached, error: null });
  const from = vi.fn(() => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
    upsert,
  }));
  return { from, upsert };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPublicHolidays — timeout + fallback", () => {
  it("passes a 10s AbortSignal to fetch, and falls back to stale cache when the request aborts", async () => {
    const staleCache = {
      holidays: ["2026-01-01", "2026-01-26"],
      fetched_at: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(), // 60 days old, stale
    };
    const supabaseMock = buildSupabaseMock({ cached: staleCache });
    vi.mocked(createAdminClient).mockReturnValue(supabaseMock as never);

    let capturedSignal: AbortSignal | undefined;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      capturedSignal = (init as RequestInit)?.signal as AbortSignal;
      return Promise.reject(new DOMException("The operation was aborted.", "TimeoutError"));
    });

    const result = await getPublicHolidays("NSW", 2026);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("date.nager.at"),
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    // Confirms the call is bounded (a real AbortSignal, not undefined/never-firing).
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
    // Falls back to the stale cache rather than throwing or hanging.
    expect(result).toEqual(new Set(["2026-01-01", "2026-01-26"]));
  });

  it("falls back to weekends-only (empty set) when the fetch fails with no cache", async () => {
    const supabaseMock = buildSupabaseMock({ cached: null });
    vi.mocked(createAdminClient).mockReturnValue(supabaseMock as never);
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    const result = await getPublicHolidays("NSW", 2026);
    expect(result).toEqual(new Set());
  });

  it("returns fresh holidays from the API and caches them on success", async () => {
    const supabaseMock = buildSupabaseMock({ cached: null });
    vi.mocked(createAdminClient).mockReturnValue(supabaseMock as never);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        { date: "2026-01-01", global: true, counties: null },
        { date: "2026-06-08", global: false, counties: ["AU-NSW"] },
        { date: "2026-03-02", global: false, counties: ["AU-WA"] },
      ],
    } as Response);

    const result = await getPublicHolidays("NSW", 2026);
    expect(result).toEqual(new Set(["2026-01-01", "2026-06-08"]));
    expect(supabaseMock.upsert).toHaveBeenCalled();
  });
});
