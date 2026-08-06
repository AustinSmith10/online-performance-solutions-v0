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

  it("ignores a highlight trapped inside a tracked-change formatting snapshot (rPrChange)", () => {
    const buf = makeDocxBuffer(
      `<root><w:r><w:rPr><w:rPrChange w:id="1" w:author="A" w:date="2024-01-01T00:00:00Z"><w:rPr><w:highlight w:val="yellow"/></w:rPr></w:rPrChange></w:rPr><w:t>a</w:t></w:r></root>`
    );
    expect(scanDocxStructure(buf)).toEqual([]);
  });

  it("still flags a genuine, currently-rendered highlight alongside an rPrChange snapshot", () => {
    const buf = makeDocxBuffer(
      `<root><w:r><w:rPr><w:highlight w:val="yellow"/><w:rPrChange w:id="1" w:author="A" w:date="2024-01-01T00:00:00Z"><w:rPr><w:highlight w:val="green"/></w:rPr></w:rPrChange></w:rPr><w:t>a</w:t></w:r></root>`
    );
    const findings = scanDocxStructure(buf);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: "highlighted_runs", count: 1 });
  });

  it("ignores a highlight set only on a paragraph mark's own run properties (w:pPr > w:rPr), never on visible text", () => {
    // Real-world case: a table-cell paragraph style carries a highlight in
    // its w:pPr > w:rPr (the invisible end-of-paragraph pilcrow's own
    // formatting), while the paragraph's actual <w:r> runs are unhighlighted.
    // Word never renders this as a highlight on the paragraph's content.
    const buf = makeDocxBuffer(
      `<root><w:p><w:pPr><w:pStyle w:val="DDTblTxt"/><w:rPr><w:highlight w:val="yellow"/></w:rPr></w:pPr><w:r><w:t>Building Act 1975.</w:t></w:r></w:p></root>`
    );
    expect(scanDocxStructure(buf)).toEqual([]);
  });

  it("still flags a genuine highlight on a run alongside an unrelated paragraph-mark highlight", () => {
    const buf = makeDocxBuffer(
      `<root><w:p><w:pPr><w:rPr><w:highlight w:val="lightGray"/></w:rPr></w:pPr><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>flagged text</w:t></w:r></w:p></root>`
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
