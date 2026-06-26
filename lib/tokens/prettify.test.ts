import { describe, it, expect } from "vitest";
import { prettifyToken } from "./prettify";

describe("prettifyToken", () => {
  describe("prefix stripping", () => {
    it("removes EXTRACT_ prefix", () => {
      expect(prettifyToken("EXTRACT_SITE_ADDRESS")).toBe("Site Address");
    });

    it("removes CLIENT_ prefix", () => {
      expect(prettifyToken("CLIENT_PO_NUMBER")).toBe("Po Number");
    });

    it("removes ORG_ prefix", () => {
      expect(prettifyToken("ORG_CERTIFIER_NAME")).toBe("Certifier Name");
    });

    it("removes SYS_ prefix", () => {
      expect(prettifyToken("SYS_DATE")).toBe("Date");
    });

    it("removes PROJECT_ prefix", () => {
      expect(prettifyToken("PROJECT_NUMBER")).toBe("Number");
    });
  });

  describe("title-casing", () => {
    it("title-cases each word separated by underscores", () => {
      expect(prettifyToken("CLIENT_FIRST_NAME")).toBe("First Name");
    });

    it("lowercases all non-first characters within each word", () => {
      expect(prettifyToken("EXTRACT_SITE_REFERENCE")).toBe("Site Reference");
    });

    it("handles single-word tokens after prefix stripping", () => {
      expect(prettifyToken("CLIENT_NAME")).toBe("Name");
    });

    it("handles multi-word tokens without a known prefix", () => {
      expect(prettifyToken("SITE_ADDRESS")).toBe("Site Address");
    });
  });

  describe("unknown prefix tokens", () => {
    it("title-cases the full token including the unknown prefix", () => {
      expect(prettifyToken("UNKNOWN_TOKEN")).toBe("Unknown Token");
    });

    it("treats a bare single word as a single title-cased word", () => {
      expect(prettifyToken("NAME")).toBe("Name");
    });
  });
});
