import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { extractPlaceholderTokens } from "./validator";

function makeDocxBuffer(documentXml: string, extras: Record<string, string> = {}): ArrayBuffer {
  const zip = new PizZip();
  zip.file("word/document.xml", documentXml);
  for (const [name, xml] of Object.entries(extras)) {
    zip.file(name, xml);
  }
  const buf = zip.generate({ type: "nodebuffer" }) as Buffer;
  // Convert Node Buffer to ArrayBuffer
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

function p(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

describe("extractPlaceholderTokens", () => {
  describe("basic extraction from document body", () => {
    it("extracts a single token", async () => {
      const buf = makeDocxBuffer(`<root>${p("{SITE_ADDRESS}")}</root>`);
      expect(await extractPlaceholderTokens(buf)).toContain("SITE_ADDRESS");
    });

    it("returns the token name without the braces", async () => {
      const buf = makeDocxBuffer(`<root>${p("{PROJECT_NO}")}</root>`);
      const tokens = await extractPlaceholderTokens(buf);
      expect(tokens).toContain("PROJECT_NO");
      expect(tokens).not.toContain("{PROJECT_NO}");
    });

    it("extracts multiple unique tokens from different paragraphs", async () => {
      const buf = makeDocxBuffer(
        `<root>${p("{SITE_ADDRESS}")}${p("{PROJECT_NO}")}${p("{CLIENT_NAME}")}</root>`
      );
      const tokens = await extractPlaceholderTokens(buf);
      expect(tokens).toContain("SITE_ADDRESS");
      expect(tokens).toContain("PROJECT_NO");
      expect(tokens).toContain("CLIENT_NAME");
    });

    it("deduplicates repeated tokens", async () => {
      const buf = makeDocxBuffer(
        `<root>${p("{TOKEN_A}")}${p("{TOKEN_A}")}${p("{TOKEN_A}")}</root>`
      );
      const tokens = await extractPlaceholderTokens(buf);
      expect(tokens.filter((t) => t === "TOKEN_A")).toHaveLength(1);
    });

    it("returns results in sorted order", async () => {
      const buf = makeDocxBuffer(
        `<root>${p("{ZEBRA_TOKEN}")}${p("{ALPHA_TOKEN}")}${p("{MIDDLE_TOKEN}")}</root>`
      );
      const tokens = await extractPlaceholderTokens(buf);
      expect(tokens).toEqual([...tokens].sort());
    });

    it("returns an empty array when no tokens are present", async () => {
      const buf = makeDocxBuffer(`<root>${p("No tokens here — just plain text.")}</root>`);
      expect(await extractPlaceholderTokens(buf)).toEqual([]);
    });
  });

  describe("token patterns", () => {
    it("accepts uppercase tokens", async () => {
      const buf = makeDocxBuffer(`<root>${p("{UPPERCASE_TOKEN}")}</root>`);
      expect(await extractPlaceholderTokens(buf)).toContain("UPPERCASE_TOKEN");
    });

    it("accepts mixed-case tokens", async () => {
      const buf = makeDocxBuffer(`<root>${p("{Mixed_Case_Token}")}</root>`);
      expect(await extractPlaceholderTokens(buf)).toContain("Mixed_Case_Token");
    });

    it("accepts lowercase tokens", async () => {
      const buf = makeDocxBuffer(`<root>${p("{site_address}")}</root>`);
      expect(await extractPlaceholderTokens(buf)).toContain("site_address");
    });

    it("accepts tokens with numbers", async () => {
      const buf = makeDocxBuffer(`<root>${p("{ADDRESS_LINE2}")}</root>`);
      expect(await extractPlaceholderTokens(buf)).toContain("ADDRESS_LINE2");
    });

    it("does not extract text that looks like a template token outside braces", async () => {
      const buf = makeDocxBuffer(`<root>${p("SITE_ADDRESS without braces")}</root>`);
      expect(await extractPlaceholderTokens(buf)).toEqual([]);
    });
  });

  describe("run-split tokens", () => {
    it("handles a token split across two <w:t> runs in the same paragraph", async () => {
      const splitPara = `<w:p><w:r><w:t>{SITE</w:t></w:r><w:r><w:t>_ADDRESS}</w:t></w:r></w:p>`;
      const buf = makeDocxBuffer(`<root>${splitPara}</root>`);
      const tokens = await extractPlaceholderTokens(buf);
      expect(tokens).toContain("SITE_ADDRESS");
    });

    it("handles a token split across three runs", async () => {
      const splitPara = `<w:p><w:r><w:t>{</w:t></w:r><w:r><w:t>PROJECT</w:t></w:r><w:r><w:t>_NO}</w:t></w:r></w:p>`;
      const buf = makeDocxBuffer(`<root>${splitPara}</root>`);
      expect(await extractPlaceholderTokens(buf)).toContain("PROJECT_NO");
    });
  });

  describe("extraction from header and footer files", () => {
    it("extracts tokens from word/header1.xml", async () => {
      const buf = makeDocxBuffer(`<root>${p("body")}</root>`, {
        "word/header1.xml": `<root>${p("{HEADER_TOKEN}")}</root>`,
      });
      expect(await extractPlaceholderTokens(buf)).toContain("HEADER_TOKEN");
    });

    it("extracts tokens from word/header2.xml", async () => {
      const buf = makeDocxBuffer(`<root>${p("body")}</root>`, {
        "word/header2.xml": `<root>${p("{HEADER2_TOKEN}")}</root>`,
      });
      expect(await extractPlaceholderTokens(buf)).toContain("HEADER2_TOKEN");
    });

    it("extracts tokens from word/footer1.xml", async () => {
      const buf = makeDocxBuffer(`<root>${p("body")}</root>`, {
        "word/footer1.xml": `<root>${p("{FOOTER_TOKEN}")}</root>`,
      });
      expect(await extractPlaceholderTokens(buf)).toContain("FOOTER_TOKEN");
    });

    it("merges tokens from body and headers into a single deduplicated sorted list", async () => {
      const buf = makeDocxBuffer(`<root>${p("{BODY_TOKEN}")}</root>`, {
        "word/header1.xml": `<root>${p("{HEADER_TOKEN}")}</root>`,
        "word/footer1.xml": `<root>${p("{BODY_TOKEN}")}</root>`,
      });
      const tokens = await extractPlaceholderTokens(buf);
      expect(tokens).toContain("BODY_TOKEN");
      expect(tokens).toContain("HEADER_TOKEN");
      expect(tokens.filter((t) => t === "BODY_TOKEN")).toHaveLength(1);
    });
  });
});
