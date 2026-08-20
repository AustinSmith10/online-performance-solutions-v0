import { describe, it, expect } from "vitest";
import { stepProgress } from "./FileSlot";
import type { ClientPipelineFile } from "./pipelineTypes";

function makeFile(overrides: Partial<ClientPipelineFile> = {}): ClientPipelineFile {
  return {
    localId: "1",
    requirementId: "req-1",
    slug: "purchase_order",
    name: "purchase-order.pdf",
    size: 1024,
    objectUrl: "blob:x",
    fileId: null,
    uploading: false,
    error: null,
    verificationCompleted: false,
    mismatchReasons: null,
    confirmed: false,
    extractionStatus: "not_applicable",
    extractionError: null,
    ...overrides,
  };
}

describe("stepProgress (#130)", () => {
  it("is 25 while uploading", () => {
    expect(stepProgress(makeFile({ uploading: true }))).toBe(25);
  });

  it("is 50 while checking (verification not yet completed)", () => {
    expect(stepProgress(makeFile({ verificationCompleted: false }))).toBe(50);
  });

  it("halts at 50 (same step as Checking) when flagged and unconfirmed — does not advance to Extracting", () => {
    expect(
      stepProgress(
        makeFile({ verificationCompleted: true, mismatchReasons: ["mismatch"], confirmed: false })
      )
    ).toBe(50);
  });

  it("advances past 50 once a flagged file is confirmed", () => {
    expect(
      stepProgress(
        makeFile({
          verificationCompleted: true,
          mismatchReasons: ["mismatch"],
          confirmed: true,
          extractionStatus: "running",
        })
      )
    ).toBe(75);
  });

  it("is 75 while extracting (running or pending)", () => {
    expect(stepProgress(makeFile({ verificationCompleted: true, extractionStatus: "running" }))).toBe(75);
    expect(stepProgress(makeFile({ verificationCompleted: true, extractionStatus: "pending" }))).toBe(75);
  });

  it("is 100 once ready (extraction completed or not applicable)", () => {
    expect(stepProgress(makeFile({ verificationCompleted: true, extractionStatus: "completed" }))).toBe(100);
    expect(stepProgress(makeFile({ verificationCompleted: true, extractionStatus: "not_applicable" }))).toBe(100);
  });

  it("returns null (no bar) on an upload error", () => {
    expect(stepProgress(makeFile({ error: "Upload failed" }))).toBeNull();
  });

  it("returns null (no bar) on an extraction failure", () => {
    expect(
      stepProgress(makeFile({ verificationCompleted: true, extractionStatus: "failed" }))
    ).toBeNull();
  });
});
