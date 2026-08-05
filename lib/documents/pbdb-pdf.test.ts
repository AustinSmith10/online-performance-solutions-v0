import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/documents/pdf");
vi.mock("@/lib/documents/color-strip");

import { getOrCreateDispatchPdf } from "./pbdb-pdf";
import { convertDocxToPdf } from "@/lib/documents/pdf";
import { stripRedTokenColor } from "@/lib/documents/color-strip";
import { buildPbdbFilename } from "@/lib/documents/naming";
import { formatAddress } from "@/lib/documents/formatters";

const PROJECT_ID = "proj-1";
const CLIENT_ID = "org-1";
const ACTOR_ID = "actor-1";

function fakeBlob() {
  return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
}

/** Builds a project_files mock keyed by call order for a given table. */
function buildSupabaseMock(opts: {
  cachedPdf?: unknown;
  sourceDocx?: unknown;
  downloadOk?: boolean;
  pbdbRevision?: number;
}) {
  const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const uploadFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const downloadFn = vi.fn().mockResolvedValue(
    opts.downloadOk === false
      ? { data: null, error: { message: "download failed" } }
      : { data: fakeBlob(), error: null }
  );
  const removeFn = vi.fn().mockResolvedValue({ data: null, error: null });

  let projectFilesCall = 0;
  const from = vi.fn((table: string) => {
    if (table === "revision_history") {
      // getCurrentRevNumber lookup — current PBDB revision for filename derivation.
      const row = opts.pbdbRevision != null ? { rev_number: opts.pbdbRevision } : null;
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
      };
    }
    if (table !== "project_files") throw new Error(`unexpected table ${table}`);
    projectFilesCall++;
    if (projectFilesCall === 1) {
      // source docx lookup (looked up first now — its version scopes the cache lookup)
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: opts.sourceDocx ?? null, error: null }),
      };
    }
    if (projectFilesCall === 2) {
      // pbdb_pdf cache lookup, scoped to the source docx's version
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: opts.cachedPdf ?? null, error: null }),
      };
    }
    // insert of newly generated pbdb_pdf row
    return { insert: insertFn };
  });

  const storage = {
    from: vi.fn().mockReturnValue({ download: downloadFn, upload: uploadFn, remove: removeFn }),
  };

  return { from, storage, insertFn, uploadFn, downloadFn, removeFn };
}

const BASE_PROJECT = {
  id: PROJECT_ID,
  client_id: CLIENT_ID,
  strip_token_color: false,
  project_number: "OPS-1",
  extracted_fields: { EXTRACT_ADDRESS: "123 Main St" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2024, 2, 15));
  vi.mocked(convertDocxToPdf).mockResolvedValue(Buffer.from("pdf-bytes"));
  vi.mocked(stripRedTokenColor).mockImplementation((buf: Buffer) => buf);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getOrCreateDispatchPdf", () => {
  it("returns null when no source docx exists for the cycle", async () => {
    const mock = buildSupabaseMock({ sourceDocx: null });
    const result = await getOrCreateDispatchPdf(
      mock as never,
      { ...BASE_PROJECT, review_cycle: 1 },
      ACTOR_ID
    );
    expect(result).toBeNull();
    expect(mock.uploadFn).not.toHaveBeenCalled();
  });

  it("reuses a cached PDF for the cycle instead of converting again", async () => {
    const cached = { storage_path: "org-1/proj-1/pbdb/v2_file.pdf", original_filename: "file.pdf" };
    const sourceDocx = { storage_path: "org-1/proj-1/pbdb/v2_file.docx", original_filename: "file.docx", version: 2 };
    const mock = buildSupabaseMock({ cachedPdf: cached, sourceDocx });

    const result = await getOrCreateDispatchPdf(
      mock as never,
      { ...BASE_PROJECT, review_cycle: 2 },
      ACTOR_ID
    );

    expect(result).toEqual({ storagePath: cached.storage_path, originalFilename: cached.original_filename });
    expect(vi.mocked(convertDocxToPdf)).not.toHaveBeenCalled();
    expect(mock.uploadFn).not.toHaveBeenCalled();
  });

  it("scopes the cache lookup to the source docx's version, not just review_cycle (#112)", async () => {
    // A same-cycle QA re-upload bumps project_files.version without bumping
    // review_cycle. The cache query now filters on that version, so a
    // version mismatch (simulated here as the query simply finding nothing)
    // must fall through to reconversion rather than serving a stale PDF.
    const newerDocx = { storage_path: "org-1/proj-1/pbdb/v3_file.docx", original_filename: "file.docx", version: 3 };
    const mock = buildSupabaseMock({ cachedPdf: null, sourceDocx: newerDocx, pbdbRevision: 0 });

    const result = await getOrCreateDispatchPdf(
      mock as never,
      { ...BASE_PROJECT, review_cycle: 2 },
      ACTOR_ID
    );

    expect(vi.mocked(convertDocxToPdf)).toHaveBeenCalledTimes(1);
    expect(mock.uploadFn).toHaveBeenCalled();
    expect(result?.storagePath).toBe("org-1/proj-1/pbdb/v3_file.pdf");
  });

  it("converts the cycle's source docx to PDF and caches it when none exists yet", async () => {
    const docx = {
      storage_path: "org-1/proj-1/pbdb/v3_OPS-1-S PBDB Rev2 For QA.docx",
      original_filename: "OPS-1-S PBDB Rev2 For QA.docx",
      version: 3,
    };
    const mock = buildSupabaseMock({ sourceDocx: docx, pbdbRevision: 2 });

    const result = await getOrCreateDispatchPdf(
      mock as never,
      { ...BASE_PROJECT, review_cycle: 3 },
      ACTOR_ID
    );

    // Dispatch-time filename regenerates: no "For QA" suffix, today's date, Rev2 from revision_history.
    const expectedFilename = buildPbdbFilename(
      "OPS-1",
      2,
      formatAddress("123 Main St"),
      new Date(2024, 2, 15),
      { forQa: false }
    ).replace(/\.docx$/i, ".pdf");
    const expectedStoragePath = "org-1/proj-1/pbdb/v3_OPS-1-S PBDB Rev2 For QA.pdf";

    expect(vi.mocked(convertDocxToPdf)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stripRedTokenColor)).not.toHaveBeenCalled();
    expect(mock.uploadFn).toHaveBeenCalledWith(
      expectedStoragePath,
      expect.anything(),
      { contentType: "application/pdf" }
    );
    expect(mock.insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        file_type: "pbdb_pdf",
        review_cycle: 3,
        version: 3,
        storage_path: expectedStoragePath,
        original_filename: expectedFilename,
      })
    );
    expect(result?.storagePath).toBe(expectedStoragePath);
    expect(result?.originalFilename).toBe(expectedFilename);
  });

  it("strips the red token colour before conversion when the toggle is on", async () => {
    const docx = { storage_path: "org-1/proj-1/pbdb/v1_file.docx", original_filename: "file.docx", version: 1 };
    const mock = buildSupabaseMock({ sourceDocx: docx, pbdbRevision: 0 });

    await getOrCreateDispatchPdf(
      mock as never,
      { ...BASE_PROJECT, review_cycle: 1, strip_token_color: true },
      ACTOR_ID
    );

    expect(vi.mocked(stripRedTokenColor)).toHaveBeenCalledTimes(1);
  });

  it("picks the correct cycle's docx across multiple review cycles (multi-cycle rejection scenario)", async () => {
    // Cycle 1 had two docx versions (v1 generated, v2 a QA correction before dispatch);
    // cycle 2 has v3 (the reupload after a rejection). Dispatching cycle 2 must pick v3.
    const cycle2Docx = { storage_path: "org-1/proj-1/pbdb/v3_R1.docx", original_filename: "R1.docx", version: 3 };
    const mock = buildSupabaseMock({ sourceDocx: cycle2Docx, pbdbRevision: 1 });

    const result = await getOrCreateDispatchPdf(
      mock as never,
      { ...BASE_PROJECT, review_cycle: 2 },
      ACTOR_ID
    );

    expect(result?.storagePath).toBe("org-1/proj-1/pbdb/v3_R1.pdf");
    expect(mock.insertFn).toHaveBeenCalledWith(expect.objectContaining({ review_cycle: 2, version: 3 }));
  });

  it("throws and cleans up the uploaded object if recording the pbdb_pdf row fails", async () => {
    const docx = { storage_path: "org-1/proj-1/pbdb/v1_file.docx", original_filename: "file.docx", version: 1 };
    const mock = buildSupabaseMock({ sourceDocx: docx, pbdbRevision: 0 });
    mock.insertFn.mockResolvedValue({ data: null, error: { message: "db down" } });

    await expect(
      getOrCreateDispatchPdf(
        mock as never,
        { ...BASE_PROJECT, review_cycle: 1 },
        ACTOR_ID
      )
    ).rejects.toThrow("Failed to record PBDB PDF");

    expect(mock.removeFn).toHaveBeenCalledWith(["org-1/proj-1/pbdb/v1_file.pdf"]);
  });
});
