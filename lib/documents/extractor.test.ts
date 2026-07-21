import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  parseJson,
  collectHighConfidenceEntries,
  parseVerificationResponse,
  applyVerificationResults,
  type ExtractedField,
  type VerificationEntry,
  type VerificationResult,
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

describe("collectHighConfidenceEntries — verification-pass scoping (Task A)", () => {
  it("only collects fields graded high — medium/low already flag without help", () => {
    const fields: Record<string, ExtractedField[]> = {
      EXTRACT_HOUSE_TYPE: [{ value: "MORETONG5", confidence: "high" }],
      EXTRACT_ADDRESS: [{ value: "12 Smith St", confidence: "medium" }],
    };
    const entries = collectHighConfidenceEntries(fields, [
      { token: "EXTRACT_HOUSE_TYPE", label: "House Type", hint: "single-word style name" },
      { token: "EXTRACT_ADDRESS", label: "Address", hint: "full street address" },
    ]);
    expect(entries).toEqual([
      { token: "EXTRACT_HOUSE_TYPE", idx: 0, hint: "single-word style name", value: "MORETONG5" },
    ]);
  });

  it("skips empty values even if graded high", () => {
    const fields: Record<string, ExtractedField[]> = {
      EXTRACT_HOUSE_TYPE: [{ value: "", confidence: "high" }],
    };
    const entries = collectHighConfidenceEntries(fields, [
      { token: "EXTRACT_HOUSE_TYPE", label: "House Type", hint: "single-word style name" },
    ]);
    expect(entries).toEqual([]);
  });

  it("collects every high-confidence candidate across every token, batched for one document", () => {
    const fields: Record<string, ExtractedField[]> = {
      EXTRACT_SITE_WD_NO: [
        { value: "WD-001", confidence: "high" },
        { value: "WD-002", confidence: "high" },
      ],
      EXTRACT_FLOOR_WD_NO: [{ value: "WD-100", confidence: "high" }],
    };
    const entries = collectHighConfidenceEntries(fields, [
      { token: "EXTRACT_SITE_WD_NO", label: "Site WD", hint: "matches WD-###" },
      { token: "EXTRACT_FLOOR_WD_NO", label: "Floor WD", hint: "matches WD-###" },
    ]);
    expect(entries).toHaveLength(3);
  });
});

describe("parseVerificationResponse — pure parsing, no I/O", () => {
  it("parses a well-formed downgrade response", () => {
    const raw = JSON.stringify([{ index: 0, confidence: "low", reason: "Looks like two fields fused together." }]);
    const results = parseVerificationResponse(raw, 1);
    expect(results.get(0)).toEqual({ confidence: "low", reason: "Looks like two fields fused together." });
  });

  it("defaults a missing reason to an empty string", () => {
    const raw = JSON.stringify([{ index: 0, confidence: "high" }]);
    const results = parseVerificationResponse(raw, 1);
    expect(results.get(0)).toEqual({ confidence: "high", reason: "" });
  });

  it("ignores entries with an out-of-range index", () => {
    const raw = JSON.stringify([{ index: 5, confidence: "low", reason: "x" }]);
    const results = parseVerificationResponse(raw, 1);
    expect(results.size).toBe(0);
  });

  it("ignores entries with an invalid confidence value", () => {
    const raw = JSON.stringify([{ index: 0, confidence: "certain", reason: "x" }]);
    const results = parseVerificationResponse(raw, 1);
    expect(results.size).toBe(0);
  });

  it("returns an empty map when the response has no JSON array", () => {
    const results = parseVerificationResponse("not json at all", 1);
    expect(results.size).toBe(0);
  });

  it("returns an empty map when the response is malformed JSON", () => {
    const results = parseVerificationResponse("[{not valid json]", 1);
    expect(results.size).toBe(0);
  });
});

describe("applyVerificationResults — most-skeptical-voice-wins, never raises confidence (Task A)", () => {
  function entry(overrides: Partial<VerificationEntry> = {}): VerificationEntry {
    return { token: "EXTRACT_HOUSE_TYPE", idx: 0, hint: "single-word style name", value: "MORETONG5", ...overrides };
  }

  it("downgrades a high-confidence field and records the verifier's reason", () => {
    const fields: Record<string, ExtractedField[]> = {
      EXTRACT_HOUSE_TYPE: [{ value: "MORETONG5", confidence: "high" }],
    };
    const entries = [entry()];
    const results = new Map<number, VerificationResult>([
      [0, { confidence: "low", reason: "Looks like two fields fused together." }],
    ]);
    applyVerificationResults(fields, entries, results);
    expect(fields.EXTRACT_HOUSE_TYPE[0]).toEqual({
      value: "MORETONG5",
      confidence: "low",
      reason: "Looks like two fields fused together.",
    });
  });

  it("leaves the field untouched when the verifier agrees it's high confidence", () => {
    const fields: Record<string, ExtractedField[]> = {
      EXTRACT_HOUSE_TYPE: [{ value: "MORETON", confidence: "high" }],
    };
    const entries = [entry({ value: "MORETON" })];
    const results = new Map<number, VerificationResult>([[0, { confidence: "high", reason: "" }]]);
    applyVerificationResults(fields, entries, results);
    expect(fields.EXTRACT_HOUSE_TYPE[0]).toEqual({ value: "MORETON", confidence: "high" });
  });

  it("leaves the field untouched when no result was returned for it (fail-open per-item)", () => {
    const fields: Record<string, ExtractedField[]> = {
      EXTRACT_HOUSE_TYPE: [{ value: "MORETONG5", confidence: "high" }],
    };
    const entries = [entry()];
    applyVerificationResults(fields, entries, new Map());
    expect(fields.EXTRACT_HOUSE_TYPE[0]).toEqual({ value: "MORETONG5", confidence: "high" });
  });

  it("omits an empty reason string rather than storing it", () => {
    const fields: Record<string, ExtractedField[]> = {
      EXTRACT_HOUSE_TYPE: [{ value: "MORETONG5", confidence: "high" }],
    };
    const entries = [entry()];
    const results = new Map<number, VerificationResult>([[0, { confidence: "medium", reason: "" }]]);
    applyVerificationResults(fields, entries, results);
    expect(fields.EXTRACT_HOUSE_TYPE[0]).toEqual({ value: "MORETONG5", confidence: "medium" });
  });
});
