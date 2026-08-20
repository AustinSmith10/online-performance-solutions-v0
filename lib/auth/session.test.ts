import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/supabase/server");

import { getSessionUser, requireRole } from "./session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AUTH_USER = { id: "user-1" };

function mockAuthUser(user: { id: string } | null = AUTH_USER) {
  vi.mocked(createServerClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : new Error("no session"),
      }),
    },
  } as never);
}

/**
 * Builds a chainable query mock matching the filter chain in getSessionUser:
 * .from("users").select("*").eq("id", ...).is("deleted_at", null)
 *   .eq("is_active", true).eq("is_locked", false).maybeSingle()
 *
 * `row` is the profile that would be returned if it passes every filter
 * applied so far; filters that would exclude it collapse the result to null,
 * mimicking how Postgres filters behave server-side.
 */
function mockProfileQuery(row: Record<string, unknown> | null) {
  const passesFilter = (
    current: Record<string, unknown> | null,
    predicate: (r: Record<string, unknown>) => boolean
  ) => (current && predicate(current) ? current : null);

  const from = vi.fn((table: string) => {
    if (table !== "users") throw new Error(`unexpected table ${table}`);

    let current = row;

    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn((col: string, value: unknown) => {
        if (col === "id") {
          current = passesFilter(current, (r) => r.id === value);
        } else {
          current = passesFilter(current, (r) => r[col] === value);
        }
        return chain;
      }),
      is: vi.fn((col: string, value: unknown) => {
        current = passesFilter(current, (r) => r[col] === value);
        return chain;
      }),
      maybeSingle: vi.fn(async () => ({ data: current, error: null })),
    };

    return chain;
  });

  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return from;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── getSessionUser ─────────────────────────────────────────────────────────

describe("getSessionUser", () => {
  it("returns the profile for an active, unlocked, non-deleted user", async () => {
    mockAuthUser();
    mockProfileQuery({
      id: "user-1",
      role: "consultant",
      deleted_at: null,
      is_active: true,
      is_locked: false,
    });

    const result = await getSessionUser();
    expect(result).toEqual({
      id: "user-1",
      role: "consultant",
      deleted_at: null,
      is_active: true,
      is_locked: false,
    });
  });

  it("returns null (not a thrown error) for a soft-deleted user", async () => {
    mockAuthUser();
    mockProfileQuery({
      id: "user-1",
      role: "consultant",
      deleted_at: "2026-08-19T00:00:00.000Z",
      is_active: true,
      is_locked: false,
    });

    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("returns null (not a thrown error) for a deactivated (is_active=false) user", async () => {
    mockAuthUser();
    mockProfileQuery({
      id: "user-1",
      role: "consultant",
      deleted_at: null,
      is_active: false,
      is_locked: false,
    });

    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("returns null (not a thrown error) for a locked user", async () => {
    mockAuthUser();
    mockProfileQuery({
      id: "user-1",
      role: "consultant",
      deleted_at: null,
      is_active: true,
      is_locked: true,
    });

    await expect(getSessionUser()).resolves.toBeNull();
  });

  it("returns null when there is no auth session", async () => {
    mockAuthUser(null);
    mockProfileQuery(null);

    await expect(getSessionUser()).resolves.toBeNull();
  });
});

// ─── requireRole — redirect convention ─────────────────────────────────────

describe("requireRole", () => {
  it("redirects to /login instead of throwing when the session check fails", async () => {
    mockAuthUser();
    mockProfileQuery({
      id: "user-1",
      role: "consultant",
      deleted_at: null,
      is_active: true,
      is_locked: true,
    });

    await expect(requireRole("consultant")).rejects.toThrow("REDIRECT:/login");
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("returns the profile when checks pass and role matches", async () => {
    mockAuthUser();
    mockProfileQuery({
      id: "user-1",
      role: "consultant",
      deleted_at: null,
      is_active: true,
      is_locked: false,
    });

    const result = await requireRole("consultant");
    expect(result).toMatchObject({ id: "user-1", role: "consultant" });
    expect(redirect).not.toHaveBeenCalled();
  });
});
