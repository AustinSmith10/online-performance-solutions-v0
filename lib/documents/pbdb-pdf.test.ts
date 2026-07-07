import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/documents/pdf");
vi.mock("@/lib/documents/color-strip");

import { getOrCreateDispatchPdf } from "./pbdb-pdf";
import { convertDocxToPdf } from "@/lib/documents/pdf";
import { stripRedTokenColor } from "@/lib/documents/color-strip";

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
}) {
  const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const uploadFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const downloadFn = vi.fn().mockResolvedValue(
    opts.downloadOk === false
      ? { data: null, error: { message: "download failed" } }
      : { data: fakeBlob(), error: null }
  );
  const removeFn = vi.fn().mockResolvedValue({ data: null, error: null });

  let call = 0;
  const from = vi.fn((table: string) => {
    if (table !== "project_files") throw new Error(`unexpected table ${table}`);
    call++;
    if (call === 1) {
      // pbdb_pdf cache lookup
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: opts.cachedPdf ?? null, error: null }),
      };
    }
    if (call === 2) {
      // source docx lookup
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: opts.sourceDocx ?? null, error: null }),
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(convertDocxToPdf).mockResolvedValue(Buffer.from("pdf-bytes"));
  vi.mocked(stripRedTokenColor).mockImplementation((buf: Buffer) => buf);
});

describe("getOrCreateDispatchPdf", () => {
  it("returns null when no source docx exists for the cycle", async () => {
    const mock = buildSupabaseMock({ sourceDocx: null });
    const result = await getOrCreateDispatchPdf(
      mock as never,
      { id: PROJECT_ID, client_id: CLIENT_ID, review_cycle: 1, strip_token_color: false },
      ACTOR_ID
    );
    expect(result).toBeNull();
    expect(mock.uploadFn).not.toHaveBeenCalled();
  });

  it("reuses a cached PDF for the cycle instead of converting again", async () => {
    const cached = { storage_path: "org-1/proj-1/pbdb/v2_file.pdf", original_filename: "file.pdf" };
    const mock = buildSupabaseMock({ cachedPdf: cached });

    const result = await getOrCreateDispatchPdf(
      mock as never,
      { id: PROJECT_ID, client_id: CLIENT_ID, review_cycle: 2, strip_token_color: false },
      ACTOR_ID
    );

    expect(result).toEqual({ storagePath: cached.storage_path, originalFilename: cached.original_filename });
    expect(vi.mocked(convertDocxToPdf)).not.toHaveBeenCalled();
    expect(mock.uploadFn).not.toHaveBeenCalled();
  });

  it("converts the cycle's source docx to PDF and caches it when none exists yet", async () => {
    const docx = {
      storage_path: "org-1/proj-1/pbdb/v3_OPS-1-S PBDB R2.docx",
      original_filename: "OPS-1-S PBDB R2.docx",
      version: 3,
    };
    const mock = buildSupabaseMock({ sourceDocx: docx });

    const result = await getOrCreateDispatchPdf(
      mock as never,
      { id: PROJECT_ID, client_id: CLIENT_ID, review_cycle: 3, strip_token_color: false },
      ACTOR_ID
    );

    expect(vi.mocked(convertDocxToPdf)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(stripRedTokenColor)).not.toHaveBeenCalled();
    expect(mock.uploadFn).toHaveBeenCalledWith(
      "org-1/proj-1/pbdb/v3_OPS-1-S PBDB R2.pdf",
      expect.anything(),
      { contentType: "application/pdf" }
    );
    expect(mock.insertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        file_type: "pbdb_pdf",
        review_cycle: 3,
        version: 3,
        storage_path: "org-1/proj-1/pbdb/v3_OPS-1-S PBDB R2.pdf",
      })
    );
    expect(result?.storagePath).toBe("org-1/proj-1/pbdb/v3_OPS-1-S PBDB R2.pdf");
  });

  it("strips the red token colour before conversion when the toggle is on", async () => {
    const docx = { storage_path: "org-1/proj-1/pbdb/v1_file.docx", original_filename: "file.docx", version: 1 };
    const mock = buildSupabaseMock({ sourceDocx: docx });

    await getOrCreateDispatchPdf(
      mock as never,
      { id: PROJECT_ID, client_id: CLIENT_ID, review_cycle: 1, strip_token_color: true },
      ACTOR_ID
    );

    expect(vi.mocked(stripRedTokenColor)).toHaveBeenCalledTimes(1);
  });

  it("picks the correct cycle's docx across multiple review cycles (multi-cycle rejection scenario)", async () => {
    // Cycle 1 had two docx versions (v1 generated, v2 a QA correction before dispatch);
    // cycle 2 has v3 (the reupload after a rejection). Dispatching cycle 2 must pick v3.
    const cycle2Docx = { storage_path: "org-1/proj-1/pbdb/v3_R1.docx", original_filename: "R1.docx", version: 3 };
    const mock = buildSupabaseMock({ sourceDocx: cycle2Docx });

    const result = await getOrCreateDispatchPdf(
      mock as never,
      { id: PROJECT_ID, client_id: CLIENT_ID, review_cycle: 2, strip_token_color: false },
      ACTOR_ID
    );

    expect(result?.storagePath).toBe("org-1/proj-1/pbdb/v3_R1.pdf");
    expect(mock.insertFn).toHaveBeenCalledWith(expect.objectContaining({ review_cycle: 2, version: 3 }));
  });

  it("throws and cleans up the uploaded object if recording the pbdb_pdf row fails", async () => {
    const docx = { storage_path: "org-1/proj-1/pbdb/v1_file.docx", original_filename: "file.docx", version: 1 };
    const mock = buildSupabaseMock({ sourceDocx: docx });
    mock.insertFn.mockResolvedValue({ data: null, error: { message: "db down" } });

    await expect(
      getOrCreateDispatchPdf(
        mock as never,
        { id: PROJECT_ID, client_id: CLIENT_ID, review_cycle: 1, strip_token_color: false },
        ACTOR_ID
      )
    ).rejects.toThrow("Failed to record PBDB PDF");

    expect(mock.removeFn).toHaveBeenCalledWith(["org-1/proj-1/pbdb/v1_file.pdf"]);
  });
});
