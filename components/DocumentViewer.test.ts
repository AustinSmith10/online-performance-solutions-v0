import { describe, it, expect } from "vitest";
import { isPreviewable } from "./DocumentViewer";

describe("isPreviewable", () => {
  it("detects a pdf from a signed URL when filename is a non-filename display label (#116)", () => {
    // e.g. FlagAcknowledgeControl passes candidate.source_document (a file
    // requirement's display label, no extension) as filename, with a real
    // signed .pdf URL as src.
    expect(isPreviewable("Purchase Order", "https://example.com/signed/abc123.pdf?token=xyz")).toBe(true);
  });

  it("falls back to filename when src is an extensionless blob: URL (upload-stage regression)", () => {
    // FileSlot.tsx previews a not-yet-uploaded local file via
    // URL.createObjectURL(file), which has no extension — the real
    // filename must still be trusted.
    expect(isPreviewable("Construction_issue_drawing.pdf", "blob:https://app.example.com/9b1e-....")).toBe(
      true
    );
  });

  it("is not previewable when neither filename nor src carries a recognizable extension", () => {
    expect(isPreviewable("Purchase Order", "blob:https://app.example.com/9b1e-....")).toBe(false);
  });

  it("detects images", () => {
    expect(isPreviewable("photo.jpg", null)).toBe(true);
    expect(isPreviewable(null, "https://example.com/scan.PNG?x=1")).toBe(true);
  });

  it("rejects unsupported formats like docx", () => {
    expect(isPreviewable("report.docx", "https://example.com/report.docx")).toBe(false);
  });
});
