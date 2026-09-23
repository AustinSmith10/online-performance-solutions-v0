import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/admin");
vi.mock("@/lib/auth/session");
vi.mock("@/lib/auth/project-access");
vi.mock("@/lib/audit/log");
vi.mock("@/lib/documents/extractor", () => ({ extractDocumentFields: vi.fn() }));
vi.mock("@/lib/documents/extraction-budget", () => ({ claimExtractionSlots: vi.fn() }));
vi.mock("@/lib/documents/metrics-autofill", async (orig) => ({
  ...(await orig<object>()),
  getMetricsAutofillConfigs: vi.fn().mockResolvedValue([]),
}));

import { reExtractProject } from "./field-flags";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth/session";
import { requireProjectAccess } from "@/lib/auth/project-access";
import { extractDocumentFields } from "@/lib/documents/extractor";
import { claimExtractionSlots } from "@/lib/documents/extraction-budget";

function query(data: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order"]) q[m] = vi.fn(() => q);
  q.then = (fn: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(fn);
  return q;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireRole).mockResolvedValue({ id: "consultant-1", role: "consultant" } as never);
  vi.mocked(requireProjectAccess).mockResolvedValue({
    id: "proj-1",
    client_id: "org-1",
    template_id: "tmpl-1",
    assigned_consultant_id: "consultant-1",
  } as never);
  const tables: Record<string, unknown> = {
    file_requirements: [{ slug: "drawings" }],
    template_field_mappings: [],
    field_flags: [],
    project_files: [
      { file_type: "drawings", storage_path: "a.pdf", original_filename: "a.pdf" },
      { file_type: "drawings", storage_path: "b.pdf", original_filename: "b.pdf" },
    ],
  };
  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn((t: string) => query(tables[t] ?? [])),
    storage: {
      from: () => ({
        download: vi.fn().mockResolvedValue({ data: { arrayBuffer: async () => new ArrayBuffer(1) }, error: null }),
      }),
    },
  } as never);
});

describe("reExtractProject — daily extraction budget (#152)", () => {
  it("charges one slot per document and refuses without calling the AI when the budget can't cover them all", async () => {
    vi.mocked(claimExtractionSlots).mockResolvedValue({ granted: 1, limit: 30 });

    const result = await reExtractProject("proj-1");

    expect(claimExtractionSlots).toHaveBeenCalledWith(expect.anything(), "consultant-1", 2);
    expect(result).toEqual({ ok: false, error: expect.stringMatching(/Daily extraction limit reached \(30\/24h\)/) });
    expect(extractDocumentFields).not.toHaveBeenCalled();
  });

  it("proceeds to extraction when every document fits the budget", async () => {
    vi.mocked(claimExtractionSlots).mockResolvedValue({ granted: 2, limit: 30 });
    vi.mocked(extractDocumentFields).mockRejectedValue(new Error("stop here"));

    await reExtractProject("proj-1");

    expect(extractDocumentFields).toHaveBeenCalledTimes(1);
  });
});
