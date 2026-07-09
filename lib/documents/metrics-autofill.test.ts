import { describe, it, expect } from "vitest";
import { getAutofillExclusionTokens, resolveMetricsAutofill, type MetricsAutofillConfig } from "./metrics-autofill";

function makeConfig(overrides: Partial<MetricsAutofillConfig> = {}): MetricsAutofillConfig {
  return {
    matchToken: "EXTRACT_DEV_NAME",
    matchColumnId: "col-dev-name",
    outputs: [
      { outputToken: "EXTRACT_TRUSTEE", outputColumnId: "col-trustee" },
      { outputToken: "EXTRACT_RAINFALL_INTENSITY", outputColumnId: "col-aep" },
    ],
    rows: [
      { data: { "col-dev-name": "Riverside Estate", "col-trustee": "Riverside Pty Ltd", "col-aep": 63.2 } },
      { data: { "col-dev-name": "Northgate", "col-trustee": "Northgate Trustee Co", "col-aep": 58.1 } },
    ],
    ...overrides,
  };
}

describe("getAutofillExclusionTokens", () => {
  it("unions output tokens across all configs", () => {
    const configs = [makeConfig(), makeConfig({ outputs: [{ outputToken: "EXTRACT_OTHER", outputColumnId: "col-x" }] })];
    expect(getAutofillExclusionTokens(configs)).toEqual(new Set(["EXTRACT_TRUSTEE", "EXTRACT_RAINFALL_INTENSITY", "EXTRACT_OTHER"]));
  });

  it("returns an empty set when there are no configs", () => {
    expect(getAutofillExclusionTokens([])).toEqual(new Set());
  });
});

describe("resolveMetricsAutofill", () => {
  it("fills output tokens on an exact case-insensitive match", () => {
    const fields: Record<string, { value: string; confidence: string }> = {
      EXTRACT_DEV_NAME: { value: "riverside estate", confidence: "high" },
    };
    resolveMetricsAutofill([makeConfig()], fields);
    expect(fields.EXTRACT_TRUSTEE).toEqual({ value: "Riverside Pty Ltd", confidence: "high" });
    expect(fields.EXTRACT_RAINFALL_INTENSITY).toEqual({ value: "63.2", confidence: "high" });
  });

  it("falls back to substring match in both directions", () => {
    const fields: Record<string, { value: string; confidence: string }> = {
      EXTRACT_DEV_NAME: { value: "Northgate Stage 2" },
    } as never;
    resolveMetricsAutofill([makeConfig()], fields);
    expect(fields.EXTRACT_TRUSTEE?.value).toBe("Northgate Trustee Co");
  });

  it("leaves fields untouched when there is no match (graceful fallback)", () => {
    const fields: Record<string, { value: string; confidence: string }> = {
      EXTRACT_DEV_NAME: { value: "Unknown Place" },
    } as never;
    resolveMetricsAutofill([makeConfig()], fields);
    expect(fields.EXTRACT_TRUSTEE).toBeUndefined();
    expect(fields.EXTRACT_RAINFALL_INTENSITY).toBeUndefined();
  });

  it("does not treat rows with an empty match column as a substring match", () => {
    const fields: Record<string, { value: string; confidence: string }> = {
      EXTRACT_DEV_NAME: { value: "Anything" },
    } as never;
    const config = makeConfig({
      rows: [{ data: { "col-dev-name": null, "col-trustee": "Should Not Match" } }],
    });
    resolveMetricsAutofill([config], fields);
    expect(fields.EXTRACT_TRUSTEE).toBeUndefined();
  });

  it("no-ops when the match token was not extracted", () => {
    const fields: Record<string, { value: string; confidence: string }> = {};
    resolveMetricsAutofill([makeConfig()], fields);
    expect(Object.keys(fields)).toHaveLength(0);
  });
});
