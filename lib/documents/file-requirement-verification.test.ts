import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/documents/extractor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/documents/extractor")>("@/lib/documents/extractor");
  return { ...actual, runTextCompletion: vi.fn() };
});

import { runDeterministicCheck, runAiJudgeCheck, verifyUploadAgainstRequirement } from "./file-requirement-verification";
import { runTextCompletion } from "@/lib/documents/extractor";

const NO_MARKERS = {
  markerTextPatterns: null,
  markerPageCountMin: null,
  markerPageCountMax: null,
  markerRegex: null,
  aiJudgeHint: null,
};

describe("runDeterministicCheck", () => {
  it("returns null (skipped) when nothing is configured", () => {
    expect(runDeterministicCheck(NO_MARKERS, { text: "hello", pageCount: 1 })).toBeNull();
  });

  it("passes when all configured markers match", () => {
    const req = { ...NO_MARKERS, markerTextPatterns: ["Purchase Order"], markerPageCountMin: 1, markerPageCountMax: 3 };
    expect(runDeterministicCheck(req, { text: "This is a Purchase Order", pageCount: 2 })).toEqual({ ok: true });
  });

  it("flags a missing text marker", () => {
    const req = { ...NO_MARKERS, markerTextPatterns: ["Purchase Order"] };
    const result = runDeterministicCheck(req, { text: "Building Plans v2", pageCount: 1 });
    expect(result?.ok).toBe(false);
    expect(result?.reason).toContain("Purchase Order");
  });

  it("flags a page count outside range", () => {
    const req = { ...NO_MARKERS, markerPageCountMin: 5, markerPageCountMax: 10 };
    const result = runDeterministicCheck(req, { text: "x", pageCount: 2 });
    expect(result?.ok).toBe(false);
  });

  it("flags a regex mismatch", () => {
    const req = { ...NO_MARKERS, markerRegex: "PO-\\d+" };
    const result = runDeterministicCheck(req, { text: "no po number here", pageCount: 1 });
    expect(result?.ok).toBe(false);
  });

  it("never throws on an invalid regex — treats it as passing", () => {
    const req = { ...NO_MARKERS, markerRegex: "(" };
    expect(runDeterministicCheck(req, { text: "x", pageCount: 1 })).toEqual({ ok: true });
  });
});

describe("runAiJudgeCheck", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null (skipped) when no hint is configured", async () => {
    const result = await runAiJudgeCheck({ aiJudgeHint: null }, "some text");
    expect(result).toBeNull();
    expect(runTextCompletion).not.toHaveBeenCalled();
  });

  it("passes cleanly when the judge says it matches with high confidence", async () => {
    vi.mocked(runTextCompletion).mockResolvedValue('{"matches": true, "confidence": "high", "reason": ""}');
    const result = await runAiJudgeCheck({ aiJudgeHint: "A Purchase Order" }, "text");
    expect(result).toEqual({ ok: true });
  });

  it("flags when the judge says it doesn't match", async () => {
    vi.mocked(runTextCompletion).mockResolvedValue('{"matches": false, "confidence": "high", "reason": "This looks like a drawing, not a PO."}');
    const result = await runAiJudgeCheck({ aiJudgeHint: "A Purchase Order" }, "text");
    expect(result).toEqual({ ok: false, reason: "This looks like a drawing, not a PO." });
  });

  it("surfaces a soft 'couldn't confirm' gate on a low-confidence match (#174)", async () => {
    vi.mocked(runTextCompletion).mockResolvedValue('{"matches": true, "confidence": "low", "reason": "text is garbled"}');
    const result = await runAiJudgeCheck({ aiJudgeHint: "A Purchase Order", name: "Purchase Order" }, "text");
    expect(result?.ok).toBe(true);
    expect(result?.unverified).toBe(true);
    expect(result?.reason).toContain("Purchase Order");
  });

  it("is non-blocking but not silent when the judge call throws (#174)", async () => {
    vi.mocked(runTextCompletion).mockRejectedValue(new Error("API down"));
    const result = await runAiJudgeCheck({ aiJudgeHint: "A Purchase Order" }, "text");
    expect(result?.ok).toBe(true);
    expect(result?.unverified).toBe(true);
  });

  it("is non-blocking but not silent when the response isn't parseable JSON (#174)", async () => {
    vi.mocked(runTextCompletion).mockResolvedValue("not json");
    const result = await runAiJudgeCheck({ aiJudgeHint: "A Purchase Order" }, "text");
    expect(result?.ok).toBe(true);
    expect(result?.unverified).toBe(true);
  });
});

describe("runAiJudgeCheck — sample-aware prompt construction (#115)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("omits any sample grounding from the prompt when no sample text is passed", async () => {
    vi.mocked(runTextCompletion).mockResolvedValue('{"matches": true, "confidence": "high", "reason": ""}');
    await runAiJudgeCheck({ aiJudgeHint: "A Purchase Order" }, "doc text");
    const prompt = vi.mocked(runTextCompletion).mock.calls[0][0];
    expect(prompt).not.toContain("reference sample");
  });

  it("omits any sample grounding from the prompt when sample text is explicitly null", async () => {
    vi.mocked(runTextCompletion).mockResolvedValue('{"matches": true, "confidence": "high", "reason": ""}');
    await runAiJudgeCheck({ aiJudgeHint: "A Purchase Order" }, "doc text", null);
    const prompt = vi.mocked(runTextCompletion).mock.calls[0][0];
    expect(prompt).not.toContain("reference sample");
  });

  it("includes the sample text as grounding when present", async () => {
    vi.mocked(runTextCompletion).mockResolvedValue('{"matches": true, "confidence": "high", "reason": ""}');
    await runAiJudgeCheck({ aiJudgeHint: "A Purchase Order" }, "doc text", "SAMPLE PO CONTENT");
    const prompt = vi.mocked(runTextCompletion).mock.calls[0][0];
    expect(prompt).toContain("reference sample");
    expect(prompt).toContain("SAMPLE PO CONTENT");
  });

  it("stays non-blocking (but marks unverified) on error with a sample present", async () => {
    vi.mocked(runTextCompletion).mockRejectedValue(new Error("API down"));
    const result = await runAiJudgeCheck({ aiJudgeHint: "A Purchase Order" }, "doc text", "SAMPLE PO CONTENT");
    expect(result?.ok).toBe(true);
    expect(result?.unverified).toBe(true);
  });
});

describe("verifyUploadAgainstRequirement", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips non-PDF uploads entirely", async () => {
    const reasons = await verifyUploadAgainstRequirement(
      { name: "PO", ...NO_MARKERS, markerTextPatterns: ["Purchase Order"] },
      Buffer.from("not a pdf"),
      false
    );
    expect(reasons).toEqual([]);
  });
});
