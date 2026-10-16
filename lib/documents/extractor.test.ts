import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

vi.mock("server-only", () => ({}));

const messagesCreate = vi.fn();
const { mockGetExtractionCap, messagesStream, mockRecordAiUsage, mockClaimSlot } = vi.hoisted(() => ({
  mockGetExtractionCap: vi.fn(),
  messagesStream: vi.fn(),
  mockRecordAiUsage: vi.fn(),
  mockClaimSlot: vi.fn(),
}));
vi.mock("@/lib/ai/usage", () => ({ recordAiUsage: mockRecordAiUsage }));
vi.mock("@/lib/documents/extraction-budget", () => ({ claimExtractionSlot: mockClaimSlot }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/settings/extraction-document-text-cap", async (orig) => ({
  ...(await orig<object>()),
  getExtractionDocumentTextCharCap: mockGetExtractionCap,
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate, stream: messagesStream };
  },
}));

// extractor.ts loads pdf-parse via createRequire (real Node require), which
// bypasses vi.mock's module interception — so a real, valid PDF is used
// instead of a mocked parser.
const VALID_PDF = readFileSync(join(__dirname, "__fixtures__/valid-sample.pdf"));
const BLANK_PDF = readFileSync(join(__dirname, "__fixtures__/blank-no-text.pdf"));

import {
  parseJson,
  mergeExtractionResults,
  extractSingleDocument,
  extractSingleDocumentStreaming,
  hasReadableText,
  runTextCompletion,
  countCompletedFields,
  extractionFieldTotal,
  type SingleDocExtraction,
  type ExtractToken,
} from "./extractor";

describe("hasReadableText — scan detection", () => {
  it("treats a near-empty text layer as unreadable", () => {
    expect(hasReadableText("", 1)).toBe(false);
    expect(hasReadableText("  Scanned by Xerox  ", 5)).toBe(false);
  });

  it("treats a long scan with a stray footer per page as unreadable", () => {
    expect(hasReadableText("x".repeat(120), 20)).toBe(false);
  });

  it("treats ordinary documents as readable", () => {
    expect(hasReadableText("Purchase Order PO-123 ".repeat(20), 1)).toBe(true);
    expect(hasReadableText("x".repeat(93_000), 27)).toBe(true);
  });
});

describe("countCompletedFields — streamed extraction progress (#115)", () => {
  it("counts only fully-emitted confidence pairs in a partial JSON snapshot", () => {
    const partial =
      '{ "po_number": { "value": "PO1", "confidence": "high" }, ' +
      '"EXTRACT_ADDRESS": [ { "value": "12 Smith St", "confidence": "medium" } ], ' +
      '"EXTRACT_WD_NO": [ { "value": "WD-1", "conf';
    expect(countCompletedFields(partial)).toBe(2);
  });

  it("is zero before the first field closes", () => {
    expect(countCompletedFields('{ "po_number": { "value": "PO1", "confi')).toBe(0);
  });

  it("tolerates whitespace variants", () => {
    expect(countCompletedFields('"confidence":"low" "confidence" : "high"')).toBe(2);
  });

  it("extractionFieldTotal is token count plus po_number", () => {
    expect(
      extractionFieldTotal([
        { token: "A", label: "A", hint: "" },
        { token: "B", label: "B", hint: "" },
      ])
    ).toBe(3);
  });
});

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
    messagesStream.mockReset();
    mockRecordAiUsage.mockReset();
    mockClaimSlot.mockReset();
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

  it("the streaming path also re-throws a provider failure instead of returning an empty 'completed' result", async () => {
    messagesStream.mockImplementation(() => ({
      on: () => {},
      finalMessage: () => Promise.reject(new Error("Anthropic down")),
    }));

    await expect(
      extractSingleDocumentStreaming({ label: "doc.pdf", buffer: VALID_PDF }, TOKENS)
    ).rejects.toThrow("Anthropic down");
  });

  it("skips the AI call for a PDF with no readable text and logs it", async () => {
    const single = await extractSingleDocument({ label: "scan.pdf", buffer: BLANK_PDF }, TOKENS, { userId: "u1" });

    expect(messagesCreate).not.toHaveBeenCalled();
    expect(single.result.skipped).toBe("no_text");
    expect(single.result.fields.EXTRACT_ADDRESS).toEqual([{ value: "", confidence: "low" }]);
    expect(mockRecordAiUsage).toHaveBeenCalledWith("scan skipped (extraction)", "none", undefined, { userId: "u1" });
  });

  it("skips the AI call on the streaming path too", async () => {
    const single = await extractSingleDocumentStreaming({ label: "scan.pdf", buffer: BLANK_PDF }, TOKENS);

    expect(messagesStream).not.toHaveBeenCalled();
    expect(single.result.skipped).toBe("no_text");
  });

  it("logs token usage for a successful extraction", async () => {
    messagesCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            po_number: { value: "PO1", confidence: "high" },
            EXTRACT_ADDRESS: [{ value: "1 A St", confidence: "high" }],
          }),
        },
      ],
      usage: { input_tokens: 1234, output_tokens: 56 },
    });

    await extractSingleDocument({ label: "doc.pdf", buffer: VALID_PDF }, TOKENS, {
      userId: "u1",
      projectId: "p1",
    });

    expect(mockRecordAiUsage).toHaveBeenCalledWith(
      "document extraction",
      "claude-sonnet-5-5",
      { input_tokens: 1234, output_tokens: 56 },
      { userId: "u1", projectId: "p1" }
    );
  });

  it("runTextCompletion charges the daily budget and skips the call once it is used up", async () => {
    mockClaimSlot.mockResolvedValue({ allowed: false, limit: 30 });

    const text = await runTextCompletion("prompt", "file requirement AI judge", undefined, { userId: "u1" });

    expect(text).toBe("");
    expect(mockClaimSlot).toHaveBeenCalledWith(expect.anything(), "u1");
    expect(messagesCreate).not.toHaveBeenCalled();
  });

  it("runTextCompletion proceeds and logs usage when the budget allows it", async () => {
    mockClaimSlot.mockResolvedValue({ allowed: true, limit: 30 });
    messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "ok" }],
      usage: { input_tokens: 10, output_tokens: 2 },
    });

    const text = await runTextCompletion("prompt", "stakeholder email comment extraction", undefined, { userId: "u1" });

    expect(text).toBe("ok");
    expect(mockRecordAiUsage).toHaveBeenCalledWith(
      "stakeholder email comment extraction",
      "claude-haiku-4-5-20251001",
      { input_tokens: 10, output_tokens: 2 },
      { userId: "u1" }
    );
  });

  it("runTextCompletion returns an empty string when Anthropic throws — no fallback provider", async () => {
    messagesCreate.mockRejectedValue(new Error("Anthropic down"));

    const text = await runTextCompletion("some prompt");

    expect(text).toBe("");
    expect(messagesCreate).toHaveBeenCalledTimes(1);
  });
});

describe("extraction document text cap setting", () => {
  const TOKENS: ExtractToken[] = [{ token: "EXTRACT_ADDRESS", label: "Address", hint: "full street address" }];

  it("truncates each document's text in the extraction prompt to the configured cap", async () => {
    messagesCreate.mockReset();
    messagesCreate.mockRejectedValue(new Error("stop"));

    mockGetExtractionCap.mockResolvedValue(150_000);
    await extractSingleDocument({ label: "doc.pdf", buffer: VALID_PDF }, TOKENS).catch(() => {});
    const fullPrompt = JSON.stringify(messagesCreate.mock.calls[0][0]);

    messagesCreate.mockClear();
    mockGetExtractionCap.mockResolvedValue(5);
    await extractSingleDocument({ label: "doc.pdf", buffer: VALID_PDF }, TOKENS).catch(() => {});
    const cappedPrompt = JSON.stringify(messagesCreate.mock.calls[0][0]);

    expect(cappedPrompt.length).toBeLessThan(fullPrompt.length);
  });
});
