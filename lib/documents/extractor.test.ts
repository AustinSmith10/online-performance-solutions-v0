import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseJson } from "./extractor";

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
