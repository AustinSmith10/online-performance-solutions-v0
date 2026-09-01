import { describe, it, expect } from "vitest";
import {
  isPreviewable,
  computeRenderProgress,
  clampZoom,
  computeFitZoom,
  MIN_ZOOM,
  MAX_ZOOM,
} from "./DocumentViewer";

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

describe("computeRenderProgress (#128)", () => {
  it("is 0 while the page count isn't known yet", () => {
    expect(computeRenderProgress(0, 0)).toBe(0);
  });

  it("scales the same for a short document", () => {
    expect(computeRenderProgress(0, 6)).toBe(0);
    expect(computeRenderProgress(3, 6)).toBe(50);
    expect(computeRenderProgress(6, 6)).toBe(100);
  });

  it("scales the same for a long (29-page) document — no per-page tile blowout, just the % scaling differently per page", () => {
    expect(computeRenderProgress(1, 29)).toBe(3);
    expect(computeRenderProgress(15, 29)).toBe(52);
    expect(computeRenderProgress(29, 29)).toBe(100);
  });

  it("rounds to the nearest whole percent", () => {
    expect(computeRenderProgress(1, 3)).toBe(33);
    expect(computeRenderProgress(2, 3)).toBe(67);
  });
});

describe("clampZoom", () => {
  it("keeps a value inside [MIN_ZOOM, MAX_ZOOM]", () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-5)).toBe(MIN_ZOOM);
    expect(clampZoom(99)).toBe(MAX_ZOOM);
  });
});

describe("computeFitZoom — starting zoom that makes a page fill the pane", () => {
  it("shrinks a wide A3 sheet (≈1587pt) to fit a ~1100px pane", () => {
    const z = computeFitZoom(1100, 1587);
    expect(z).toBeCloseTo((1100 - 24) / 1587, 5);
    expect(z).toBeLessThan(1);
  });

  it("never starts above 100% for a page narrower than the pane (A4 ≈ 595pt)", () => {
    expect(computeFitZoom(1100, 595)).toBe(1);
  });

  it("respects MIN_ZOOM for an absurdly wide sheet in a tiny pane", () => {
    expect(computeFitZoom(120, 10000)).toBe(MIN_ZOOM);
  });

  it("degrades to 1 when a dimension isn't known yet", () => {
    expect(computeFitZoom(0, 1587)).toBe(1);
    expect(computeFitZoom(1100, 0)).toBe(1);
  });
});
