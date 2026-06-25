import { describe, it, expect } from "vitest";
import { buildPbdrFilename } from "./naming";

const DATE_MAR_15 = new Date(2024, 2, 15);

describe("buildPbdrFilename", () => {
  describe("output structure", () => {
    it("follows the <<ProjectNo>>-S_PBDR_R<<n>>_<<address>>_<<YYYY_MM_DD>>.pdf pattern", () => {
      expect(buildPbdrFilename("OPS-001", 0, "123 Main St", DATE_MAR_15)).toBe(
        "OPS-001-S_PBDR_R0_123_Main_St_2024_03_15.pdf"
      );
    });

    it("ends with .pdf", () => {
      expect(buildPbdrFilename("OPS-001", 0, "addr", DATE_MAR_15)).toMatch(/\.pdf$/);
    });

    it("embeds the revision index", () => {
      expect(buildPbdrFilename("OPS-001", 3, "addr", DATE_MAR_15)).toContain("_R3_");
    });

    it("revision index 0 is the first issue", () => {
      expect(buildPbdrFilename("OPS-001", 0, "addr", DATE_MAR_15)).toContain("_R0_");
    });
  });

  describe("date formatting", () => {
    it("formats date as YYYY_MM_DD", () => {
      expect(buildPbdrFilename("OPS-001", 0, "addr", DATE_MAR_15)).toContain("2024_03_15");
    });

    it("zero-pads single-digit month and day", () => {
      expect(buildPbdrFilename("OPS-001", 0, "addr", new Date(2024, 0, 5))).toContain("2024_01_05");
    });

    it("handles end-of-year dates", () => {
      expect(buildPbdrFilename("OPS-001", 0, "addr", new Date(2024, 11, 31))).toContain("2024_12_31");
    });
  });

  describe("sanitisation — spaces → underscores", () => {
    it("replaces spaces in the address", () => {
      const result = buildPbdrFilename("OPS-001", 0, "123 Main Street", DATE_MAR_15);
      expect(result).toContain("123_Main_Street");
    });

    it("collapses multiple consecutive spaces into a single underscore", () => {
      // \s+ regex: multiple spaces collapse to ONE underscore, not one per space
      const result = buildPbdrFilename("OPS-001", 0, "1  2", DATE_MAR_15);
      expect(result).toContain("1_2");
    });
  });

  describe("sanitisation — commas/periods/apostrophes/quotes removed", () => {
    it("removes commas", () => {
      expect(buildPbdrFilename("OPS-001", 0, "St, George", DATE_MAR_15)).not.toContain(",");
    });

    it("removes periods from the address segment", () => {
      // The .pdf extension retains its dot; only the sanitised segments are checked
      const result = buildPbdrFilename("OPS-001", 0, "St. George", DATE_MAR_15);
      const withoutExt = result.replace(/\.pdf$/, "");
      expect(withoutExt).not.toContain(".");
    });

    it("removes apostrophes", () => {
      expect(buildPbdrFilename("OPS-001", 0, "O'Brien Rd", DATE_MAR_15)).not.toContain("'");
    });

    it("removes straight double quotes", () => {
      expect(buildPbdrFilename("OPS-001", 0, `"quoted"`, DATE_MAR_15)).not.toContain('"');
    });
  });

  describe("sanitisation — slashes → hyphens", () => {
    it("converts forward slash to hyphen", () => {
      expect(buildPbdrFilename("OPS-001", 0, "Lot 5/12 Elm Ave", DATE_MAR_15)).toContain("5-12");
    });
  });

  describe("sanitisation — non-alphanumeric removal", () => {
    it("removes hash symbols", () => {
      expect(buildPbdrFilename("OPS-001", 0, "Unit #4", DATE_MAR_15)).not.toContain("#");
    });

    it("removes ampersands", () => {
      expect(buildPbdrFilename("OPS-001", 0, "Lot 4 & 5", DATE_MAR_15)).not.toContain("&");
    });

    it("preserves underscores", () => {
      expect(buildPbdrFilename("OPS_001", 0, "addr", DATE_MAR_15)).toContain("OPS_001");
    });

    it("preserves hyphens", () => {
      expect(buildPbdrFilename("OPS-001", 0, "addr", DATE_MAR_15)).toContain("OPS-001");
    });
  });

  describe("sanitisation — uppercase", () => {
    it("uppercases the project number", () => {
      // Only the sanitised segments are uppercased; the .pdf extension stays lowercase
      const result = buildPbdrFilename("ops-001", 0, "addr", DATE_MAR_15);
      expect(result).toContain("OPS-001");
      expect(result).not.toContain("ops-001");
    });

    it("preserves address casing from formatAddress", () => {
      const result = buildPbdrFilename("OPS-001", 0, "Elm Street", DATE_MAR_15);
      expect(result).toContain("Elm_Street");
    });
  });

  describe("length limits", () => {
    it("caps the address segment at 80 characters", () => {
      const longAddr = "A".repeat(100);
      const result = buildPbdrFilename("OPS-001", 0, longAddr, DATE_MAR_15);
      // Extract the address portion: after "OPS-001-S_PBDR_R0_" and before "_2024_03_15.pdf"
      const prefix = "OPS-001-S_PBDR_R0_";
      const suffix = "_2024_03_15.pdf";
      const addrPart = result.slice(prefix.length, result.length - suffix.length);
      expect(addrPart.length).toBeLessThanOrEqual(80);
    });

    it("caps the full filename at 200 characters", () => {
      const result = buildPbdrFilename(
        "OPS-001",
        0,
        "VERY LONG ADDRESS ".repeat(20),
        DATE_MAR_15
      );
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it("returns a short filename under 200 chars normally", () => {
      const result = buildPbdrFilename("OPS-001", 0, "123 Main St", DATE_MAR_15);
      expect(result.length).toBeLessThan(200);
    });
  });
});
