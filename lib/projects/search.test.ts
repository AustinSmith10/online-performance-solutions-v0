import { describe, it, expect } from "vitest";
import { buildProjectSearchFilter } from "./search";

describe("buildProjectSearchFilter", () => {
  it("covers project_number, po_number, site_address and the extracted address", () => {
    const filter = buildProjectSearchFilter("burpengary");
    expect(filter).toBe(
      "project_number.ilike.%burpengary%," +
        "po_number.ilike.%burpengary%," +
        "site_address.ilike.%burpengary%," +
        "extracted_fields->>EXTRACT_ADDRESS.ilike.%burpengary%"
    );
  });

  it("searches by project number", () => {
    expect(buildProjectSearchFilter("250042")).toContain("project_number.ilike.%250042%");
  });

  it("trims surrounding whitespace", () => {
    expect(buildProjectSearchFilter("  250042  ")).toContain("project_number.ilike.%250042%");
  });

  it("returns null for an empty or whitespace-only term", () => {
    expect(buildProjectSearchFilter("")).toBeNull();
    expect(buildProjectSearchFilter("   ")).toBeNull();
    expect(buildProjectSearchFilter(null)).toBeNull();
    expect(buildProjectSearchFilter(undefined)).toBeNull();
  });

  it("strips characters that would break out of the PostgREST or() string", () => {
    const filter = buildProjectSearchFilter("a,b(c)%*d");
    expect(filter).toContain("ilike.%abcd%");
    expect(filter).not.toContain(",b");
    expect(filter).not.toContain("(c)");
  });

  it("returns null when the term is only special characters", () => {
    expect(buildProjectSearchFilter(",,,()")).toBeNull();
  });
});
