import { describe, it, expect } from "vitest";
import { reducePipelineFile } from "./streamUpload";
import type { ClientPipelineFile } from "./pipelineTypes";

function base(overrides: Partial<ClientPipelineFile> = {}): ClientPipelineFile {
  return {
    localId: "1",
    requirementId: "req-1",
    slug: "purchase_order",
    name: "po.pdf",
    size: 1024,
    objectUrl: "blob:x",
    fileId: null,
    uploading: true,
    error: null,
    verificationCompleted: false,
    mismatchReasons: null,
    confirmed: false,
    extractionStatus: "not_applicable",
    extractionError: null,
    stage: "uploading",
    stageDetail: null,
    extractProgress: null,
    ...overrides,
  };
}

describe("reducePipelineFile — SSE event fold (#115)", () => {
  it("walks the clean happy path to Ready with a field count", () => {
    let f = base();
    f = reducePipelineFile(f, { type: "reading" });
    expect(f.stage).toBe("reading");
    expect(f.uploading).toBe(false);

    f = reducePipelineFile(f, { type: "verifying" });
    expect(f.stage).toBe("verifying");

    f = reducePipelineFile(f, { type: "file_created", fileId: "file-9", mismatchReasons: null });
    expect(f.fileId).toBe("file-9");
    expect(f.verificationCompleted).toBe(true);

    f = reducePipelineFile(f, { type: "extracting", fields: ["Address", "WD No"], total: 3 });
    expect(f.stage).toBe("extracting");
    expect(f.extractionStatus).toBe("running");
    expect(f.extractProgress).toEqual({ found: 0, total: 3 });

    f = reducePipelineFile(f, { type: "extract_progress", found: 2, total: 3 });
    expect(f.stageDetail).toBe("Read 2 of 3 values");
    expect(f.extractProgress).toEqual({ found: 2, total: 3 });

    f = reducePipelineFile(f, { type: "extracted", found: 2, total: 3 });
    expect(f.stageDetail).toBe("Found 2 of 3 values");

    f = reducePipelineFile(f, {
      type: "settled",
      fileId: "file-9",
      extractionStatus: "completed",
      mismatchReasons: null,
      extractionError: null,
    });
    expect(f.stage).toBeNull();
    expect(f.extractionStatus).toBe("completed");
    expect(f.extractProgress).toBeNull();
    // "Found N of M values" persists next to Ready.
    expect(f.stageDetail).toBe("Found 2 of 3 values");
  });

  it("stops narration at a flag and marks extraction pending", () => {
    let f = reducePipelineFile(base(), { type: "verifying" });
    f = reducePipelineFile(f, {
      type: "flagged",
      fileId: "file-2",
      reasons: ["Doesn't look like a Purchase Order"],
    });
    expect(f.stage).toBeNull();
    expect(f.mismatchReasons).toEqual(["Doesn't look like a Purchase Order"]);
    expect(f.extractionStatus).toBe("pending");
  });

  it("surfaces an error event and clears the stage", () => {
    const f = reducePipelineFile(base({ stage: "extracting" }), {
      type: "error",
      message: "Extraction failed.",
      fileId: "file-3",
    });
    expect(f.error).toBe("Extraction failed.");
    expect(f.stage).toBeNull();
    expect(f.fileId).toBe("file-3");
  });

  it("drops the field-count detail when the file settles as failed", () => {
    let f = reducePipelineFile(base(), { type: "extracting", fields: [], total: 2 });
    f = reducePipelineFile(f, { type: "extract_progress", found: 1, total: 2 });
    f = reducePipelineFile(f, {
      type: "settled",
      fileId: "file-4",
      extractionStatus: "failed",
      mismatchReasons: null,
      extractionError: "Daily extraction limit reached (50/24h).",
    });
    expect(f.extractionStatus).toBe("failed");
    expect(f.extractionError).toBe("Daily extraction limit reached (50/24h).");
    expect(f.stageDetail).toBeNull();
  });
});
