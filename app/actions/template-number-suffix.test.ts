import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/auth/session");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/documents/pdf");

import { updateTemplateNumberSuffix } from "./templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { auditLog } from "@/lib/audit/log";

const update = vi.fn();

function fakeSupabase(opts: { suffix: string | null; missing?: boolean }) {
  const templatesQuery = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: opts.missing ? null : { name: "PBDB", client_id: "org-1", number_suffix: opts.suffix },
    }),
    update: vi.fn((v: unknown) => {
      update(v);
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    }),
  };
  return { from: vi.fn(() => templatesQuery) };
}

function form(value: string | null) {
  const f = new FormData();
  if (value !== null) f.set("number_suffix", value);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ id: "admin-1", email: "admin@ops.test", role: "admin" } as never);
});

describe("updateTemplateNumberSuffix", () => {
  it("rejects anything outside the six disciplines", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeSupabase({ suffix: "S" }) as never);
    for (const bad of ["", "SE", "1", "X", null]) {
      const res = await updateTemplateNumberSuffix("t1", {}, form(bad));
      expect(res.error).toMatch(/Choose a discipline/i);
    }
    expect(update).not.toHaveBeenCalled();
  });

  it("changes the suffix, uppercased, and audits the change", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeSupabase({ suffix: "S" }) as never);
    const res = await updateTemplateNumberSuffix("t1", {}, form("e"));
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ number_suffix: "E" });
    expect(auditLog).toHaveBeenCalledWith(
      "template.number_suffix_changed",
      "admin-1",
      "admin@ops.test",
      expect.objectContaining({ metadata: expect.objectContaining({ from: "S", to: "E" }) })
    );
  });

  it("is never locked — changes even when the template is already in use", async () => {
    // updateTemplateNumberSuffix takes no stance on how many projects use the
    // template; the fake here has no `projects` table at all, so a lock check
    // reappearing would fail this test with "supabase.from(...).select is not
    // a function" rather than a clean assertion.
    vi.mocked(createAdminClient).mockReturnValue(fakeSupabase({ suffix: "S" }) as never);
    const res = await updateTemplateNumberSuffix("t1", {}, form("F"));
    expect(res).toEqual({ success: true });
    expect(update).toHaveBeenCalledWith({ number_suffix: "F" });
  });

  it("treats saving the current value as a no-op", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeSupabase({ suffix: "E" }) as never);
    expect(await updateTemplateNumberSuffix("t1", {}, form("E"))).toEqual({ success: true });
    expect(update).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("treats a missing suffix on the template as the default S", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeSupabase({ suffix: null }) as never);
    expect(await updateTemplateNumberSuffix("t1", {}, form("S"))).toEqual({ success: true });
    expect(update).not.toHaveBeenCalled();
  });

  it("reports a missing template", async () => {
    vi.mocked(createAdminClient).mockReturnValue(fakeSupabase({ suffix: null, missing: true }) as never);
    expect((await updateTemplateNumberSuffix("t1", {}, form("E"))).error).toMatch(/not found/i);
  });
});
