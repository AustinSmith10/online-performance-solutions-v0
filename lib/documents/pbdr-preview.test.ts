import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/documents/converter");
vi.mock("@/lib/documents/color-strip");
vi.mock("@/lib/documents/pdf");

import { buildPbdrPreview, type PbdrPreviewProject } from "./pbdr-preview";
import { convertPbdbToPbdr } from "@/lib/documents/converter";
import { convertDocxToPdf } from "@/lib/documents/pdf";

const PROJECT_ID = "proj-1";
const CLIENT_ID = "org-1";

function queryable(rows: Record<string, unknown>[]) {
  let filtered = [...rows];
  let orderCol: string | null = null;
  let ascending = true;
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return builder;
    },
    order: (col: string, opts?: { ascending?: boolean }) => {
      orderCol = col;
      ascending = opts?.ascending ?? true;
      return builder;
    },
    limit: (n: number) => {
      if (orderCol) {
        const col = orderCol;
        filtered = [...filtered].sort((a, b) =>
          ascending ? (a[col] as number) - (b[col] as number) : (b[col] as number) - (a[col] as number)
        );
      }
      filtered = filtered.slice(0, n);
      return builder;
    },
    maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
    then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: filtered, error: null }).then(fn),
  };
  return builder;
}

function buildSupabase(opts: {
  pbdbRows?: Record<string, unknown>[];
  uploadError?: { message: string } | null;
}) {
  const { pbdbRows = [], uploadError = null } = opts;
  const progressWrites: (number | null)[] = [];

  const downloadFn = vi.fn().mockResolvedValue({
    data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
    error: null,
  });
  const uploadFn = vi.fn().mockResolvedValue({ data: null, error: uploadError });

  const from = vi.fn((table: string) => {
    if (table === "projects") {
      return {
        update: vi.fn((patch: Record<string, unknown>) => {
          if (patch && "progress_pct" in patch) progressWrites.push(patch.progress_pct as number | null);
          return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
        }),
      };
    }
    if (table === "project_files") return queryable(pbdbRows);
    if (table === "revision_history") return queryable([]);
    if (table === "users") {
      return {
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }
    return queryable([]);
  });

  return {
    from,
    progressWrites,
    storage: {
      from: vi.fn().mockReturnValue({ download: downloadFn, upload: uploadFn }),
    },
  } as never;
}

const project: PbdrPreviewProject = {
  id: PROJECT_ID,
  client_id: CLIENT_ID,
  review_cycle: 1,
  strip_token_color: false,
  project_number: "OPS-1",
  extracted_fields: { EXTRACT_ADDRESS: "123 Test St" },
  assigned_consultant_id: "consultant-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convertPbdbToPbdr).mockImplementation((buf: Buffer) => buf);
  vi.mocked(convertDocxToPdf).mockResolvedValue(Buffer.from("pdf-bytes"));
});

describe("buildPbdrPreview — progress_pct (#126)", () => {
  it("writes chunked progress milestones in order on success", async () => {
    const pbdbRows = [
      { project_id: PROJECT_ID, file_type: "pbdb", storage_path: "org-1/proj-1/pbdb/v1.docx", version: 1, review_cycle: 1 },
    ];
    const supabase = buildSupabase({ pbdbRows });

    const result = await buildPbdrPreview(supabase as never, project);

    expect(result).not.toBeNull();
    expect((supabase as unknown as { progressWrites: (number | null)[] }).progressWrites).toEqual([20, 40, 70, 100, null]);
  });

  it("clears progress to null when no QA'd PBDB exists for the cycle", async () => {
    const supabase = buildSupabase({ pbdbRows: [] });

    const result = await buildPbdrPreview(supabase as never, project);

    expect(result).toBeNull();
    expect((supabase as unknown as { progressWrites: (number | null)[] }).progressWrites).toEqual([20, null, null]);
  });

  it("clears progress to null when rendering fails", async () => {
    const pbdbRows = [
      { project_id: PROJECT_ID, file_type: "pbdb", storage_path: "org-1/proj-1/pbdb/v1.docx", version: 1, review_cycle: 1 },
    ];
    const supabase = buildSupabase({ pbdbRows });
    vi.mocked(convertDocxToPdf).mockRejectedValue(new Error("gotenberg timeout"));

    await expect(buildPbdrPreview(supabase as never, project)).rejects.toThrow("gotenberg timeout");
    expect((supabase as unknown as { progressWrites: (number | null)[] }).progressWrites).toEqual([20, 40, null]);
  });
});
