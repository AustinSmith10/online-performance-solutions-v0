import { describe, it, expect } from "vitest";
import { normalizeDateValue, formatAddress, normalizeExtractedFields } from "./formatters";

describe("normalizeDateValue", () => {
  describe("dot-separated DD.MM.YYYY", () => {
    it("converts with zero-padded day and month", () => {
      expect(normalizeDateValue("1.3.2024")).toBe("01/03/2024");
    });

    it("keeps already-padded values", () => {
      expect(normalizeDateValue("15.03.2024")).toBe("15/03/2024");
    });

    it("handles end-of-year dates", () => {
      expect(normalizeDateValue("31.12.2024")).toBe("31/12/2024");
    });
  });

  describe("dash-separated D-M-YYYY", () => {
    it("converts and zero-pads", () => {
      expect(normalizeDateValue("5-6-2024")).toBe("05/06/2024");
    });

    it("handles two-digit day and month", () => {
      expect(normalizeDateValue("15-03-2024")).toBe("15/03/2024");
    });
  });

  describe("ISO YYYY-MM-DD", () => {
    it("reverses to DD/MM/YYYY", () => {
      expect(normalizeDateValue("2024-03-15")).toBe("15/03/2024");
    });

    it("handles start of year", () => {
      expect(normalizeDateValue("2024-01-01")).toBe("01/01/2024");
    });
  });

  describe("already-formatted DD/MM/YYYY", () => {
    it("passes through unchanged", () => {
      expect(normalizeDateValue("15/03/2024")).toBe("15/03/2024");
    });
  });

  describe("unrecognised formats", () => {
    it("returns input unchanged for text dates", () => {
      expect(normalizeDateValue("March 15 2024")).toBe("March 15 2024");
    });

    it("returns input unchanged for DD/MM/YY (two-digit year)", () => {
      expect(normalizeDateValue("15/03/24")).toBe("15/03/24");
    });
  });

  it("trims whitespace before matching", () => {
    expect(normalizeDateValue("  2024-01-01  ")).toBe("01/01/2024");
  });
});

describe("formatAddress", () => {
  it("converts slash separator to comma and space", () => {
    const result = formatAddress("SITE 228 / 85 TWISTS RD, BURPENGARY EAST QLD");
    expect(result).toContain("Site 228, 85");
  });

  it("expands RD to Road", () => {
    const result = formatAddress("123 HIGH RD, SUBURB QLD");
    expect(result).toContain("Road");
    expect(result).not.toMatch(/\bRD\b/);
  });

  it("expands ST to Street", () => {
    expect(formatAddress("12 MAIN ST, TOWN NSW")).toContain("Street");
  });

  it("expands AVE to Avenue", () => {
    expect(formatAddress("12 PARK AVE, SUBURB QLD")).toContain("Avenue");
  });

  it("expands DR to Drive", () => {
    expect(formatAddress("12 OAK DR, SUBURB VIC")).toContain("Drive");
  });

  it("expands CT to Court", () => {
    expect(formatAddress("12 OAK CT, SUBURB VIC")).toContain("Court");
  });

  it("expands HWY to Highway", () => {
    expect(formatAddress("100 PACIFIC HWY, SUBURB NSW")).toContain("Highway");
  });

  it("expands BLVD to Boulevard", () => {
    expect(formatAddress("1 SUNSET BLVD, SUBURB QLD")).toContain("Boulevard");
  });

  it("expands TCE to Terrace", () => {
    expect(formatAddress("5 ELM TCE, SUBURB ACT")).toContain("Terrace");
  });

  it("expands LN to Lane", () => {
    expect(formatAddress("5 GREEN LN, SUBURB WA")).toContain("Lane");
  });

  it("expands CCT to Circuit", () => {
    expect(formatAddress("1 RACING CCT, SUBURB SA")).toContain("Circuit");
  });

  describe("state/territory codes stay uppercase", () => {
    const states = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "ACT", "NT"];
    for (const state of states) {
      it(`preserves ${state}`, () => {
        const result = formatAddress(`123 MAIN ST, SUBURB ${state}`);
        expect(result).toContain(state);
        expect(result).not.toContain(
          state.charAt(0) + state.slice(1).toLowerCase()
        );
      });
    }
  });

  it("title-cases regular words", () => {
    const result = formatAddress("123 ELM STREET, SPRINGFIELD VIC");
    expect(result).toContain("Elm");
    expect(result).toContain("Springfield");
  });

  it("produces correct output for a real-world address", () => {
    const result = formatAddress("SITE 228 / 85 TWISTS RD, BURPENGARY EAST QLD");
    expect(result).toBe("Site 228, 85 Twists Road, Burpengary East QLD");
  });
});

describe("normalizeExtractedFields", () => {
  it("applies normalizeDateValue to any key containing 'DATE'", () => {
    const result = normalizeExtractedFields({ CLIENT_DATE: "15.03.2024" });
    expect(result.CLIENT_DATE).toBe("15/03/2024");
  });

  it("applies normalizeDateValue to SYS_DATE", () => {
    const result = normalizeExtractedFields({ SYS_DATE: "2024-06-01" });
    expect(result.SYS_DATE).toBe("01/06/2024");
  });

  it("applies formatAddress to any key containing 'ADDRESS'", () => {
    const result = normalizeExtractedFields({ EXTRACT_ADDRESS: "123 MAIN ST, SUBURB NSW" });
    expect(result.EXTRACT_ADDRESS).toContain("Street");
  });

  it("applies formatAddress to CLIENT_ADDRESS", () => {
    const result = normalizeExtractedFields({ CLIENT_ADDRESS: "5 OAK AVE, SUBURB QLD" });
    expect(result.CLIENT_ADDRESS).toContain("Avenue");
  });

  it("passes through other fields unchanged", () => {
    const result = normalizeExtractedFields({ CLIENT_NAME: "JOHN SMITH", CLIENT_PO: "PO-123" });
    expect(result.CLIENT_NAME).toBe("JOHN SMITH");
    expect(result.CLIENT_PO).toBe("PO-123");
  });

  it("handles multiple keys of different types in one call", () => {
    const result = normalizeExtractedFields({
      CLIENT_DATE: "2024-01-15",
      EXTRACT_ADDRESS: "12 ELM ST, SUBURB QLD",
      CLIENT_NAME: "ACME CORP",
    });
    expect(result.CLIENT_DATE).toBe("15/01/2024");
    expect(result.EXTRACT_ADDRESS).toContain("Street");
    expect(result.CLIENT_NAME).toBe("ACME CORP");
  });

  it("returns an empty object for empty input", () => {
    expect(normalizeExtractedFields({})).toEqual({});
  });
});
