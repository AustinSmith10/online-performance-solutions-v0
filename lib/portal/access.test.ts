import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getStakeholderReviewedProjectIds, stakeholderAccessFilter } from "./access";

function makeSupabase(rows: { project_id: string }[]) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: rows, error: null }),
    }),
  };
}

describe("getStakeholderReviewedProjectIds", () => {
  it("returns deduplicated project ids across every review status, not just pending", async () => {
    const supabase = makeSupabase([
      { project_id: "11111111-1111-1111-1111-111111111111" },
      { project_id: "11111111-1111-1111-1111-111111111111" },
      { project_id: "22222222-2222-2222-2222-222222222222" },
    ]);

    const result = await getStakeholderReviewedProjectIds(supabase as never, "reviewer@example.com");

    expect(result.sort()).toEqual([
      "11111111-1111-1111-1111-111111111111",
      "22222222-2222-2222-2222-222222222222",
    ]);
  });

  it("drops a malformed id rather than passing it through to a raw filter string", async () => {
    const supabase = makeSupabase([
      { project_id: "11111111-1111-1111-1111-111111111111" },
      { project_id: "not-a-uuid); drop table projects; --" },
    ]);

    const result = await getStakeholderReviewedProjectIds(supabase as never, "x@example.com");

    expect(result).toEqual(["11111111-1111-1111-1111-111111111111"]);
  });
});

describe("stakeholderAccessFilter", () => {
  it("scopes to submitted_by alone when there are no reviewed projects", () => {
    expect(stakeholderAccessFilter("user-1", [])).toBe("submitted_by.eq.user-1");
  });

  it("includes reviewed project ids alongside submitted_by", () => {
    expect(stakeholderAccessFilter("user-1", ["proj-a", "proj-b"])).toBe(
      "submitted_by.eq.user-1,id.in.(proj-a,proj-b)"
    );
  });
});
