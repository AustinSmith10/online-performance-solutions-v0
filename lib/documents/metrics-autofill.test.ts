import { describe, it, expect } from "vitest";
import {
  getAutofillExclusionTokens,
  matchDevelopmentName,
  normalizeDevelopmentName,
  resolveMetricsAutofill,
  suggestDevelopmentName,
  type MetricsAutofillConfig,
} from "./metrics-autofill";

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

  it("falls back to a whole-word prefix match for a suffixed name", () => {
    const fields: Record<string, { value: string; confidence: string }> = {
      EXTRACT_DEV_NAME: { value: "Northgate Stage 2" },
    } as never;
    resolveMetricsAutofill([makeConfig()], fields);
    expect(fields.EXTRACT_TRUSTEE?.value).toBe("Northgate Trustee Co");
  });

  it("no longer matches by reverse containment (table name contains the extracted value)", () => {
    const fields: Record<string, { value: string; confidence: string }> = {
      EXTRACT_DEV_NAME: { value: "Riverside" },
    } as never;
    resolveMetricsAutofill([makeConfig()], fields);
    expect(fields.EXTRACT_TRUSTEE).toBeUndefined();
  });

  it("leaves fields untouched when the match is ambiguous", () => {
    const fields: Record<string, { value: string; confidence: string }> = {
      EXTRACT_DEV_NAME: { value: "Northgate – West" },
    } as never;
    const config = makeConfig({
      rows: [
        { data: { "col-dev-name": "Northgate", "col-trustee": "A" } },
        { data: { "col-dev-name": "NORTHGATE", "col-trustee": "B" } },
      ],
    });
    resolveMetricsAutofill([config], fields);
    expect(fields.EXTRACT_TRUSTEE).toBeUndefined();
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

describe("normalizeDevelopmentName", () => {
  it("folds case, dash variants, and whitespace", () => {
    expect(normalizeDevelopmentName("  Halcyon   Promenade–West ")).toBe("halcyon promenade - west");
    expect(normalizeDevelopmentName("Halcyon Promenade — West")).toBe("halcyon promenade - west");
    expect(normalizeDevelopmentName("Halcyon Promenade - West")).toBe("halcyon promenade - west");
  });
});

describe("matchDevelopmentName", () => {
  const names = ["Halcyon Promenade", "Halcyon Rise", "Halcyon Promenade – West Precinct"];

  it("treats en dash, em dash and hyphen as equivalent for an exact match", () => {
    for (const variant of [
      "Halcyon Promenade - West Precinct",
      "Halcyon Promenade — West Precinct",
      "Halcyon Promenade–West Precinct",
    ]) {
      expect(matchDevelopmentName(variant, names)).toEqual({
        status: "matched",
        name: "Halcyon Promenade – West Precinct",
        via: "exact",
      });
    }
  });

  it("ignores extra whitespace and case", () => {
    expect(matchDevelopmentName("  halcyon    RISE ", names)).toEqual({
      status: "matched",
      name: "Halcyon Rise",
      via: "exact",
    });
  });

  it("resolves a '– West'-style suffix to the base development", () => {
    expect(matchDevelopmentName("Halcyon Promenade – West", names)).toEqual({
      status: "matched",
      name: "Halcyon Promenade",
      via: "prefix",
    });
  });

  it("resolves a 'Stage 2'-style suffix to the base development", () => {
    expect(matchDevelopmentName("Halcyon Rise Stage 2", names)).toEqual({
      status: "matched",
      name: "Halcyon Rise",
      via: "prefix",
    });
  });

  it("requires a whole-word prefix, not a partial word", () => {
    expect(matchDevelopmentName("Halcyon Riseview", names)).toEqual({ status: "none" });
  });

  it("returns none when nothing matches", () => {
    expect(matchDevelopmentName("Northgate", names)).toEqual({ status: "none" });
    expect(matchDevelopmentName("", names)).toEqual({ status: "none" });
  });

  it("treats a tie between equally-long prefix matches as ambiguous", () => {
    const result = matchDevelopmentName("Halcyon Rise – Stage 2", ["Halcyon Rise", "HALCYON  rise"]);
    expect(result.status).toBe("ambiguous");
  });

  it("prefers an exact match over a prefix match", () => {
    expect(matchDevelopmentName("Halcyon Promenade", names)).toEqual({
      status: "matched",
      name: "Halcyon Promenade",
      via: "exact",
    });
  });

  it("picks the longest prefix when several prefixes match", () => {
    expect(
      matchDevelopmentName("Halcyon Promenade – West Precinct Stage 3", names)
    ).toEqual({ status: "matched", name: "Halcyon Promenade – West Precinct", via: "prefix" });
  });
});

describe("suggestDevelopmentName", () => {
  it("suggests the row sharing the most words", () => {
    expect(suggestDevelopmentName("Promenade Halcyon Estate", ["Halcyon Promenade", "Halcyon Rise"])).toBe(
      "Halcyon Promenade"
    );
  });

  it("returns null when no row shares a word", () => {
    expect(suggestDevelopmentName("Northgate", ["Halcyon Promenade"])).toBeNull();
  });
});
