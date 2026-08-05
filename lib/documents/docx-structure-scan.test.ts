import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { scanDocxStructure } from "./docx-structure-scan";

function makeDocxBuffer(documentXml: string, extras: Record<string, string> = {}): Buffer {
  const zip = new PizZip();
  zip.file("word/document.xml", documentXml);
  for (const [name, xml] of Object.entries(extras)) {
    zip.file(name, xml);
  }
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

describe("scanDocxStructure", () => {
  it("returns no findings for a clean document", () => {
    const buf = makeDocxBuffer(`<root><w:p><w:r><w:t>Hello</w:t></w:r></w:p></root>`);
    expect(scanDocxStructure(buf)).toEqual([]);
  });

  it("flags tracked-changes insertions and deletions", () => {
    const buf = makeDocxBuffer(
      `<root><w:ins w:id="1"><w:r><w:t>added</w:t></w:r></w:ins><w:del w:id="2"><w:r><w:delText>removed</w:delText></w:r></w:del></root>`
    );
    const findings = scanDocxStructure(buf);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "tracked_changes", count: 2 });
  });

  it("flags highlighted runs but ignores highlight val=none", () => {
    const buf = makeDocxBuffer(
      `<root><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>a</w:t></w:r><w:r><w:rPr><w:highlight w:val="none"/></w:rPr><w:t>b</w:t></w:r></root>`
    );
    const findings = scanDocxStructure(buf);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "highlighted_runs", count: 1 });
  });

  it("flags open comments from comments.xml", () => {
    const buf = makeDocxBuffer(`<root><w:p><w:r><w:t>Hello</w:t></w:r></w:p></root>`, {
      "word/comments.xml": `<root><w:comment w:id="0">note</w:comment><w:comment w:id="1">note2</w:comment></root>`,
    });
    const findings = scanDocxStructure(buf);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "open_comments", count: 2 });
  });

  it("reports multiple finding kinds together", () => {
    const buf = makeDocxBuffer(
      `<root><w:ins w:id="1"><w:r><w:t>x</w:t></w:r></w:ins></root>`,
      { "word/comments.xml": `<root><w:comment w:id="0">note</w:comment></root>` }
    );
    expect(scanDocxStructure(buf)).toHaveLength(2);
  });

  it("never throws on a malformed buffer", () => {
    expect(() => scanDocxStructure(Buffer.from("not a zip"))).not.toThrow();
    expect(scanDocxStructure(Buffer.from("not a zip"))).toEqual([]);
  });
});
