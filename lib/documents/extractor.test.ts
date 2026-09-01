import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("server-only", () => ({}));

const messagesCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

// extractor.ts loads pdf-parse via createRequire (real Node require), which
// bypasses vi.mock's module interception — so a real, valid PDF is used
// instead of a mocked parser.
const VALID_PDF = readFileSync(join(__dirname, "__fixtures__/valid-sample.pdf"));

import {
  parseJson,
  mergeExtractionResults,
  extractSingleDocument,
  runTextCompletion,
  type SingleDocExtraction,
  type ExtractToken,
} from "./extractor";

describe("parseJson — same-document multi-candidate parsing (#64)", () => {
  it("returns one candidate for the normal single-element-array case", () => {
    const raw = JSON.stringify({
      po_number: { value: "PO123", confidence: "high" },
      EXTRACT_ADDRESS: [{ value: "12 Smith St", confidence: "high" }],
    });
    const result = parseJson(raw, ["EXTRACT_ADDRESS"]);
    expect(result.fields.EXTRACT_ADDRESS).toEqual([{ value: "12 Smith St", confidence: "high" }]);
  });

  it("returns multiple candidates when a single bundled document lists distinct values", () => {
    const raw = JSON.stringify({
      po_number: { value: "PO123", confidence: "high" },
      EXTRACT_ADDRESS: [
        { value: "1/12 Smith St", confidence: "high" },
        { value: "2/12 Smith St", confidence: "high" },
        { value: "3/12 Smith St", confidence: "medium" },
      ],
    });
    const result = parseJson(raw, ["EXTRACT_ADDRESS"]);
    expect(result.fields.EXTRACT_ADDRESS).toHaveLength(3);
    expect(result.fields.EXTRACT_ADDRESS.map((f) => f.value)).toEqual([
      "1/12 Smith St",
      "2/12 Smith St",
      "3/12 Smith St",
    ]);
  });

  it("drops empty-value entries but keeps genuine ones", () => {
    const raw = JSON.stringify({
      po_number: { value: "", confidence: "low" },
      EXTRACT_SITE_WD_NO: [
        { value: "", confidence: "low" },
        { value: "WD-001", confidence: "high" },
      ],
    });
    const result = parseJson(raw, ["EXTRACT_SITE_WD_NO"]);
    expect(result.fields.EXTRACT_SITE_WD_NO).toEqual([{ value: "WD-001", confidence: "high" }]);
  });

  it("falls back to a single empty-field element when every entry is empty", () => {
    const raw = JSON.stringify({
      po_number: { value: "", confidence: "low" },
      EXTRACT_ADDRESS: [{ value: "", confidence: "low" }],
    });
    const result = parseJson(raw, ["EXTRACT_ADDRESS"]);
    expect(result.fields.EXTRACT_ADDRESS).toEqual([{ value: "", confidence: "low" }]);
  });

  it("tolerates a bare object (non-array) for resilience against a model that ignores the array instruction", () => {
    const raw = JSON.stringify({
      po_number: { value: "PO123", confidence: "high" },
      EXTRACT_ADDRESS: { value: "12 Smith St", confidence: "high" },
    });
    const result = parseJson(raw, ["EXTRACT_ADDRESS"]);
    expect(result.fields.EXTRACT_ADDRESS).toEqual([{ value: "12 Smith St", confidence: "high" }]);
  });

  it("throws when the response has no JSON object", () => {
    expect(() => parseJson("not json at all", ["EXTRACT_ADDRESS"])).toThrow();
  });
});

describe("mergeExtractionResults — pure cross-document merge (#115)", () => {
  const TOKENS: ExtractToken[] = [
    { token: "EXTRACT_ADDRESS", label: "Address", hint: "full street address" },
  ];

  function docResult(overrides: Partial<SingleDocExtraction> = {}): SingleDocExtraction {
    return {
      label: "doc.pdf",
      result: {
        po_number: { value: "", confidence: "low" },
        fields: { EXTRACT_ADDRESS: [{ value: "", confidence: "low" }] },
      },
      ...overrides,
    };
  }

  it("returns empty results for an empty document list", () => {
    const merged = mergeExtractionResults([], TOKENS);
    expect(merged).toEqual({
      po_number: { value: "", confidence: "low" },
      fields: { EXTRACT_ADDRESS: { value: "", confidence: "low" } },
      candidates: { EXTRACT_ADDRESS: [] },
      poCandidates: [],
    });
  });

  it("merges a single document's candidates straight through", () => {
    const doc = docResult({
      label: "po.pdf",
      result: {
        po_number: { value: "PO123", confidence: "high" },
        fields: { EXTRACT_ADDRESS: [{ value: "12 Smith St", confidence: "high" }] },
      },
    });
    const merged = mergeExtractionResults([doc], TOKENS);
    expect(merged.fields.EXTRACT_ADDRESS).toEqual({
      value: "12 Smith St",
      confidence: "high",
      source_document: "po.pdf",
    });
    expect(merged.candidates.EXTRACT_ADDRESS).toEqual([
      { value: "12 Smith St", confidence: "high", source_document: "po.pdf" },
    ]);
    expect(merged.po_number).toEqual({ value: "PO123", confidence: "high", source_document: "po.pdf" });
  });

  it("picks the highest-confidence candidate across multiple documents for a field", () => {
    const docA = docResult({
      label: "a.pdf",
      result: {
        po_number: { value: "", confidence: "low" },
        fields: { EXTRACT_ADDRESS: [{ value: "12 Smith St", confidence: "medium" }] },
      },
    });
    const docB = docResult({
      label: "b.pdf",
      result: {
        po_number: { value: "", confidence: "low" },
        fields: { EXTRACT_ADDRESS: [{ value: "14 Smith St", confidence: "high" }] },
      },
    });
    const merged = mergeExtractionResults([docA, docB], TOKENS);
    expect(merged.fields.EXTRACT_ADDRESS).toEqual({
      value: "14 Smith St",
      confidence: "high",
      source_document: "b.pdf",
    });
    expect(merged.candidates.EXTRACT_ADDRESS).toHaveLength(2);
  });

  it("breaks a po_number tie in favor of the higher-confidence document", () => {
    const docA = docResult({
      label: "a.pdf",
      result: {
        po_number: { value: "PO111", confidence: "medium" },
        fields: { EXTRACT_ADDRESS: [{ value: "", confidence: "low" }] },
      },
    });
    const docB = docResult({
      label: "b.pdf",
      result: {
        po_number: { value: "PO222", confidence: "high" },
        fields: { EXTRACT_ADDRESS: [{ value: "", confidence: "low" }] },
      },
    });
    const merged = mergeExtractionResults([docA, docB], TOKENS);
    expect(merged.po_number).toEqual({ value: "PO222", confidence: "high", source_document: "b.pdf" });
    expect(merged.poCandidates.map((c) => c.value)).toEqual(["PO111", "PO222"]);
  });

  it("excludes empty values from candidates and falls back to the empty field", () => {
    const doc = docResult({
      result: {
        po_number: { value: "", confidence: "low" },
        fields: { EXTRACT_ADDRESS: [{ value: "", confidence: "low" }] },
      },
    });
    const merged = mergeExtractionResults([doc], TOKENS);
    expect(merged.candidates.EXTRACT_ADDRESS).toEqual([]);
    expect(merged.fields.EXTRACT_ADDRESS).toEqual({ value: "", confidence: "low" });
    expect(merged.poCandidates).toEqual([]);
  });
});

describe("single-vendor (Anthropic-only) fail-open behavior", () => {
  const ORIGINAL_ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    messagesCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterAll(() => {
    process.env.ANTHROPIC_API_KEY = ORIGINAL_ANTHROPIC_KEY;
  });

  const TOKENS: ExtractToken[] = [
    { token: "EXTRACT_ADDRESS", label: "Address", hint: "full street address" },
  ];

  it("runSingleExtraction (via extractSingleDocument) re-throws when Anthropic throws — so the pipeline can mark the file failed, not silently produce an empty result (#174)", async () => {
    messagesCreate.mockRejectedValue(new Error("Anthropic down"));

    await expect(
      extractSingleDocument({ label: "doc.pdf", buffer: VALID_PDF }, TOKENS)
    ).rejects.toThrow("Anthropic down");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });

  it("runTextCompletion returns an empty string when Anthropic throws — no fallback provider", async () => {
    messagesCreate.mockRejectedValue(new Error("Anthropic down"));

    const text = await runTextCompletion("some prompt");

    expect(text).toBe("");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });
});
