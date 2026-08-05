import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin");

import { createFileRequirement, updateFileRequirement } from "./file-requirements";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";

function chain(data: unknown, error: unknown = null) {
  const obj: Record<string, unknown> = {};
  const resolve = () => Promise.resolve({ data, error });
  const self = () => obj;
  obj.select = self; obj.eq = self; obj.order = self; obj.limit = self; obj.insert = () => resolve();
  obj.update = () => obj;
  obj.maybeSingle = resolve;
  obj.then = (fn: (v: unknown) => unknown) => resolve().then(fn);
  return obj;
}

function makeFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const fields = { name: "Purchase Order", slug: "po", max_count: "1", ...overrides };
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ id: "admin-1", role: "admin" } as never);
  vi.mocked(createAdminClient).mockReturnValue({ from: () => chain(null) } as never);
});

describe("createFileRequirement — verification field validation (#113)", () => {
  it("rejects an invalid page-count range (min > max)", async () => {
    const result = await createFileRequirement(
      "tmpl-1",
      {},
      makeFormData({ marker_page_count_min: "10", marker_page_count_max: "2" })
    );
    expect(result.fieldErrors?.marker_page_count?.[0]).toMatch(/cannot exceed/i);
  });

  it("rejects an invalid regex", async () => {
    const result = await createFileRequirement("tmpl-1", {}, makeFormData({ marker_regex: "(" }));
    expect(result.fieldErrors?.marker_regex?.[0]).toMatch(/valid regular expression/i);
  });

  it("accepts a fully blank verification config", async () => {
    const result = await createFileRequirement("tmpl-1", {}, makeFormData());
    expect(result.fieldErrors).toBeUndefined();
  });

  it("accepts a valid page range and regex together", async () => {
    const result = await createFileRequirement(
      "tmpl-1",
      {},
      makeFormData({ marker_page_count_min: "1", marker_page_count_max: "5", marker_regex: "PO-\\d+" })
    );
    expect(result.fieldErrors).toBeUndefined();
  });
});

describe("updateFileRequirement — verification field validation (#113)", () => {
  it("rejects an invalid regex on update", async () => {
    const result = await updateFileRequirement("tmpl-1", "req-1", {}, makeFormData({ marker_regex: "[" }));
    expect(result.fieldErrors?.marker_regex?.[0]).toMatch(/valid regular expression/i);
  });
});
