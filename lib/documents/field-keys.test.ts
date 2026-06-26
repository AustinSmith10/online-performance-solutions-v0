import { describe, it, expect } from "vitest";
import { detectSource, isKnownToken } from "./field-keys";

describe("detectSource", () => {
  it("returns 'client' for CLIENT_ tokens", () => {
    expect(detectSource("CLIENT_NAME")).toBe("client");
  });

  it("returns 'extract' for EXTRACT_ tokens", () => {
    expect(detectSource("EXTRACT_ADDRESS")).toBe("extract");
  });

  it("returns 'org' for ORG_ tokens", () => {
    expect(detectSource("ORG_CERTIFIER_NAME")).toBe("org");
  });

  it("returns 'sys' for SYS_ tokens", () => {
    expect(detectSource("SYS_DATE")).toBe("sys");
  });

  it("returns 'project' for PROJECT_ tokens", () => {
    expect(detectSource("PROJECT_NUMBER")).toBe("project");
  });

  it("returns 'unknown' for tokens with no known prefix", () => {
    expect(detectSource("UNKNOWN_TOKEN")).toBe("unknown");
  });

  it("returns 'unknown' for a bare word with no underscore", () => {
    expect(detectSource("NOPREFIX")).toBe("unknown");
  });

  it("is case-insensitive (lowercased input still matches)", () => {
    expect(detectSource("client_name")).toBe("client");
    expect(detectSource("extract_address")).toBe("extract");
    expect(detectSource("org_certifier")).toBe("org");
    expect(detectSource("sys_date")).toBe("sys");
    expect(detectSource("project_number")).toBe("project");
  });

  it("returns 'unknown' for mixed-case unknown tokens", () => {
    expect(detectSource("Foo_Bar")).toBe("unknown");
  });
});

describe("isKnownToken", () => {
  it("returns true for CLIENT_ prefix", () => {
    expect(isKnownToken("CLIENT_NAME")).toBe(true);
  });

  it("returns true for EXTRACT_ prefix", () => {
    expect(isKnownToken("EXTRACT_ADDRESS")).toBe(true);
  });

  it("returns true for ORG_ prefix", () => {
    expect(isKnownToken("ORG_NAME")).toBe(true);
  });

  it("returns true for SYS_ prefix", () => {
    expect(isKnownToken("SYS_DATE")).toBe(true);
  });

  it("returns true for PROJECT_ prefix", () => {
    expect(isKnownToken("PROJECT_NUMBER")).toBe(true);
  });

  it("returns false for an unknown prefix", () => {
    expect(isKnownToken("UNKNOWN_TOKEN")).toBe(false);
  });

  it("returns false for a bare token with no prefix", () => {
    expect(isKnownToken("NAME")).toBe(false);
  });
});
