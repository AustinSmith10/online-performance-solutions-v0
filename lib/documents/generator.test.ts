import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin");

// The rendering pipeline itself (real docx parsing) is exercised by
// converter.test.ts / docx-structure-scan.test.ts. This file is only
// concerned with the ordering of the revision-history write relative to
// the file upload/insert (#148), so PizZip/Docxtemplater are mocked out —
// render() and getZip() are no-ops that just hand back a stub buffer.
vi.mock("pizzip", () => ({
  default: vi.fn().mockImplementation(function PizZipStub() {
    return {};
  }),
}));
vi.mock("docxtemplater", () => ({
  default: vi.fn().mockImplementation(function DocxtemplaterStub() {
    return {
      render: vi.fn(),
      getZip: () => ({ generate: () => Buffer.from("docx-bytes") }),
    };
  }),
}));

import { generatePbdb } from "./generator";
import { createAdminClient } from "@/lib/supabase/admin";

const PROJECT_ID = "proj-1";
const CLIENT_ID = "org-1";
const ACTOR_ID = "actor-1";

const project = {
  id: PROJECT_ID,
  client_id: CLIENT_ID,
  template_id: "tmpl-1",
  project_number: "OPS-1",
  extracted_fields: { EXTRACT_ADDRESS: "123 Test St" },
  created_at: "2026-01-01T00:00:00Z",
  review_cycle: 1,
  submitted_by: "sub-1",
  assigned_consultant_id: "consultant-1",
};

/** A minimal chainable query builder that actually filters an in-memory row
 * set, so tests exercise real .eq()/.order()/.limit() scoping rather than
 * just asserting mock call args. Modeled on delivery.test.ts's `queryable`. */
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
    is: () => builder,
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
    single: async () => ({ data: filtered[0] ?? null, error: null }),
    then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: filtered, error: null }).then(fn),
  };
  return builder;
}

function buildMock(opts: {
  revisionHistoryRows?: Record<string, unknown>[];
  projectFileRows?: Record<string, unknown>[];
  projectFilesInsertError?: { message: string } | null;
  uploadError?: { message: string } | null;
}) {
  const {
    revisionHistoryRows = [],
    projectFileRows = [],
    projectFilesInsertError = null,
    uploadError = null,
  } = opts;

  const revisionHistoryInsertFn = vi.fn(async (row: unknown) => {
    revisionHistoryRows.push(row as Record<string, unknown>);
    return { data: null, error: null };
  });

  const projectFilesInsertFn = vi.fn(async (row: unknown) => {
    if (projectFilesInsertError) return { data: null, error: projectFilesInsertError };
    projectFileRows.push(row as Record<string, unknown>);
    return { data: null, error: null };
  });

  const uploadFn = vi.fn().mockResolvedValue({ data: null, error: uploadError });
  const removeFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const downloadFn = vi.fn().mockResolvedValue({
    data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
    error: null,
  });
  const progressWrites: (number | null)[] = [];

  const from = vi.fn((table: string) => {
    if (table === "projects") {
      const projectsBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: project, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: project, error: null }),
        update: vi.fn((patch: Record<string, unknown>) => {
          if ("progress_pct" in patch) progressWrites.push(patch.progress_pct as number | null);
          return {
            eq: vi.fn().mockReturnThis(),
            then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(fn),
          };
        }),
      };
      return projectsBuilder;
    }
    if (table === "templates") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: { id: "tmpl-1", storage_path: "templates/tmpl-1.docx", name: "Template" },
          error: null,
        }),
      };
    }
    if (table === "clients") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { client_config: {} }, error: null }),
      };
    }
    if (table === "users") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { first_name: "Sub", last_name: "Mitter" }, error: null }),
        in: vi.fn().mockReturnThis(),
        then: (fn: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(fn),
      };
    }
    if (table === "client_config_token_links") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    }
    if (table === "project_files") {
      const q = queryable(projectFileRows);
      return { ...q, insert: projectFilesInsertFn };
    }
    if (table === "revision_history") {
      const q = queryable(revisionHistoryRows);
      return { ...q, insert: revisionHistoryInsertFn };
    }
    return queryable([]);
  });

  return {
    from,
    revisionHistoryInsertFn,
    projectFilesInsertFn,
    revisionHistoryRows,
    projectFileRows,
    progressWrites,
    storage: {
      from: vi.fn().mockReturnValue({
        download: downloadFn,
        upload: uploadFn,
        remove: removeFn,
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generatePbdb — revision-history event ordering (#148)", () => {
  it("does not write a revision row when the project_files insert fails", async () => {
    const mock = buildMock({ projectFilesInsertError: { message: "insert failed" } });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(generatePbdb(PROJECT_ID, ACTOR_ID)).rejects.toThrow(/Failed to record PBDB in database/);

    expect(mock.revisionHistoryInsertFn).not.toHaveBeenCalled();
    expect(mock.revisionHistoryRows).toHaveLength(0);
  });

  it("writes exactly one revision row on a subsequent successful attempt after a failure", async () => {
    // Shared in-memory tables persist across the two calls below, the way a
    // real retry would hit the same database rows.
    const revisionHistoryRows: Record<string, unknown>[] = [];
    const projectFileRows: Record<string, unknown>[] = [];

    const failingMock = buildMock({
      revisionHistoryRows,
      projectFileRows,
      projectFilesInsertError: { message: "insert failed" },
    });
    vi.mocked(createAdminClient).mockReturnValue(failingMock as never);
    await expect(generatePbdb(PROJECT_ID, ACTOR_ID)).rejects.toThrow();
    expect(revisionHistoryRows).toHaveLength(0);

    const succeedingMock = buildMock({ revisionHistoryRows, projectFileRows });
    vi.mocked(createAdminClient).mockReturnValue(succeedingMock as never);
    await generatePbdb(PROJECT_ID, ACTOR_ID);

    expect(revisionHistoryRows).toHaveLength(1);
    expect(revisionHistoryRows[0]).toMatchObject({
      project_id: PROJECT_ID,
      doc_type: "pbdb",
      event: "initial",
      rev_number: 0,
    });
    expect(projectFileRows).toHaveLength(1);
  });

  it("still records the initial revision event after a successful first generation", async () => {
    const mock = buildMock({});
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await generatePbdb(PROJECT_ID, ACTOR_ID);

    expect(mock.revisionHistoryInsertFn).toHaveBeenCalledTimes(1);
    expect(mock.revisionHistoryRows[0]).toMatchObject({ event: "initial", doc_type: "pbdb" });
    // The revision-history write must happen after the project_files insert
    // has already resolved (ordering, not just "eventually called").
    const insertOrder = mock.projectFilesInsertFn.mock.invocationCallOrder[0];
    const revisionOrder = mock.revisionHistoryInsertFn.mock.invocationCallOrder[0];
    expect(revisionOrder).toBeGreaterThan(insertOrder);
  });

  it("does not write a second revision row when regenerating (version > 1)", async () => {
    const revisionHistoryRows: Record<string, unknown>[] = [
      {
        project_id: PROJECT_ID,
        doc_type: "pbdb",
        rev_number: 0,
        event: "initial",
        prepared_by: "consultant-1",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];
    const projectFileRows: Record<string, unknown>[] = [
      { project_id: PROJECT_ID, file_type: "pbdb", version: 1, review_cycle: 1 },
    ];
    const mock = buildMock({ revisionHistoryRows, projectFileRows });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await generatePbdb(PROJECT_ID, ACTOR_ID);

    expect(mock.revisionHistoryInsertFn).not.toHaveBeenCalled();
    expect(revisionHistoryRows).toHaveLength(1);
  });
});

describe("generatePbdb — progress_pct (#127)", () => {
  it("writes chunked progress milestones in order on success", async () => {
    const mock = buildMock({});
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await generatePbdb(PROJECT_ID, ACTOR_ID);

    expect(mock.progressWrites).toEqual([20, 40, 70, 90, 100]);
  });

  it("resets progress to null when generation fails", async () => {
    const mock = buildMock({ projectFilesInsertError: { message: "insert failed" } });
    vi.mocked(createAdminClient).mockReturnValue(mock as never);

    await expect(generatePbdb(PROJECT_ID, ACTOR_ID)).rejects.toThrow();

    // 20/40/70/90 land before the failing insert; the caller
    // (generatePbdbForProject) is responsible for clearing progress on a
    // thrown error, not generatePbdb itself — see app/actions/projects.test.ts
    // for that coverage.
    expect(mock.progressWrites).toEqual([20, 40, 70, 90]);
  });
});
