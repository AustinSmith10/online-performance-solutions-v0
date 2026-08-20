import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session");
vi.mock("@/lib/supabase/admin");

import { getProjectProgress } from "./progress";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const PROJECT_ID = "proj-1";

function buildMock(progressPct: number | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { progress_pct: progressPct }, error: null }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({
    id: "consultant-1",
    email: "c@ddeg.com.au",
    role: "consultant",
  } as never);
});

describe("getProjectProgress", () => {
  it("returns the current progress_pct for a project", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock(40) as never);

    const result = await getProjectProgress(PROJECT_ID);

    expect(result).toEqual({ progressPct: 40 });
  });

  it("returns null when no pipeline is in flight", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock(null) as never);

    const result = await getProjectProgress(PROJECT_ID);

    expect(result).toEqual({ progressPct: null });
  });

  it("requires consultant/admin/super_admin role", async () => {
    vi.mocked(createAdminClient).mockReturnValue(buildMock(null) as never);

    await getProjectProgress(PROJECT_ID);

    expect(requireRole).toHaveBeenCalledWith("consultant", "super_admin", "admin");
  });
});
