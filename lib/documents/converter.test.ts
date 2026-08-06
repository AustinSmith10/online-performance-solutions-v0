import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { convertPbdbToPbdr, makeDocxConversionSafe } from "./converter";

function makeDocxBuffer(documentXml: string, extras: Record<string, string> = {}): Buffer {
  const zip = new PizZip();
  zip.file("word/document.xml", documentXml);
  for (const [name, xml] of Object.entries(extras)) {
    zip.file(name, xml);
  }
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

function readXml(buf: Buffer, path: string): string {
  const zip = new PizZip(buf);
  return zip.files[path]?.asText() ?? "";
}

function p(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`;
}

describe("convertPbdbToPbdr — text replacements in document body", () => {
  it("replaces 'Design Brief' with 'Design Report'", () => {
    const output = readXml(
      convertPbdbToPbdr(makeDocxBuffer(`<root>${p("Design Brief")}</root>`)),
      "word/document.xml"
    );
    expect(output).toContain("Design Report");
    expect(output).not.toContain("Design Brief");
  });

  it("replaces 'Stakeholder Review' with 'For Construction'", () => {
    const output = readXml(
      convertPbdbToPbdr(makeDocxBuffer(`<root>${p("Stakeholder Review")}</root>`)),
      "word/document.xml"
    );
    expect(output).toContain("For Construction");
    expect(output).not.toContain("Stakeholder Review");
  });

  it("replaces 'PBDB' with 'PBDR'", () => {
    const output = readXml(
      convertPbdbToPbdr(makeDocxBuffer(`<root>${p("PBDB revision 1")}</root>`)),
      "word/document.xml"
    );
    expect(output).toContain("PBDR");
    expect(output).not.toContain("PBDB");
  });

  it("replaces 'Preliminary Evaluation' with 'Evaluation'", () => {
    const output = readXml(
      convertPbdbToPbdr(makeDocxBuffer(`<root>${p("Preliminary Evaluation")}</root>`)),
      "word/document.xml"
    );
    expect(output).toContain("Evaluation");
    expect(output).not.toContain("Preliminary Evaluation");
  });

  it("replaces 'Preliminary Conclusion' with 'Conclusion'", () => {
    const output = readXml(
      convertPbdbToPbdr(makeDocxBuffer(`<root>${p("Preliminary Conclusion")}</root>`)),
      "word/document.xml"
    );
    expect(output).toContain("Conclusion");
    expect(output).not.toContain("Preliminary Conclusion");
  });

  it("applies the section 1.1 replacement before the bare 'Design Brief' rule", () => {
    const output = readXml(
      convertPbdbToPbdr(
        makeDocxBuffer(`<root>${p("Design Brief identifies the proposed")}</root>`)
      ),
      "word/document.xml"
    );
    expect(output).toContain("Design Report evaluates the proposed");
    expect(output).not.toContain("Design Brief");
  });

  it("replaces lowercase 'performance based design Brief' variant", () => {
    const output = readXml(
      convertPbdbToPbdr(
        makeDocxBuffer(`<root>${p("performance based design Brief")}</root>`)
      ),
      "word/document.xml"
    );
    expect(output).toContain("performance based design Report");
    expect(output).not.toContain("design Brief");
  });

  it("leaves unrelated text unchanged", () => {
    const input = makeDocxBuffer(`<root>${p("Hello world")}</root>`);
    const output = readXml(convertPbdbToPbdr(input), "word/document.xml");
    expect(output).toContain("Hello world");
  });

  it("handles a paragraph with multiple replacements", () => {
    const output = readXml(
      convertPbdbToPbdr(
        makeDocxBuffer(`<root>${p("Design Brief and PBDB and Stakeholder Review")}</root>`)
      ),
      "word/document.xml"
    );
    expect(output).toContain("Design Report");
    expect(output).toContain("PBDR");
    expect(output).toContain("For Construction");
    expect(output).not.toContain("Design Brief");
    expect(output).not.toContain("PBDB");
    expect(output).not.toContain("Stakeholder Review");
  });

  it("handles a run-split text across multiple <w:t> elements in one paragraph", () => {
    const splitPara = `<w:p><w:r><w:t>Design </w:t></w:r><w:r><w:t>Brief</w:t></w:r></w:p>`;
    const output = readXml(
      convertPbdbToPbdr(makeDocxBuffer(`<root>${splitPara}</root>`)),
      "word/document.xml"
    );
    expect(output).toContain("Design Report");
    expect(output).not.toContain("Design Brief");
  });

  it("handles a self-closing <w:t/> run sitting before the real text run (Word formatting-mark artifact)", () => {
    // A self-closing <w:t/> has no explicit </w:t>, so a naive regex reads
    // it as an *opening* tag and swallows everything up to the next real
    // </w:t> — including the next run's own opening tag — as literal text,
    // corrupting the paragraph and producing an invalid document.
    const splitPara = `<w:p><w:r><w:t/></w:r><w:r><w:t>PBDB</w:t></w:r></w:p>`;
    const output = convertPbdbToPbdr(makeDocxBuffer(`<root>${splitPara}</root>`));
    const xml = readXml(output, "word/document.xml");
    expect(xml).toContain("PBDR");
    expect(xml).not.toContain("PBDB");
    // The run that was corrupted showed up as literal escaped markup
    // (e.g. "&lt;/w:r&gt;") inside a <w:t> — assert that never happens.
    expect(xml).not.toContain("&lt;/w:r&gt;");
  });

  it("does not misparse <w:tab/>, <w:tc>, or other elements that merely start with 'w:t'", () => {
    // <w:t([^>]*)> without a boundary check also matches <w:tab>, <w:tc>,
    // <w:tbl> etc. — anything beginning with the same three characters —
    // which is exactly as corrupting as the self-closing-<w:t/> case.
    const para = `<w:p><w:r><w:tab/><w:t>PBDB</w:t></w:r></w:p>`;
    const output = convertPbdbToPbdr(makeDocxBuffer(`<root>${para}</root>`));
    const xml = readXml(output, "word/document.xml");
    expect(xml).toContain("<w:tab/>");
    expect(xml).toContain("PBDR");
    expect(xml).not.toContain("PBDB");
  });

  it("produces well-formed XML for a paragraph combining a self-closing <w:t/> and a <w:tab/>", () => {
    const para = `<w:p><w:r><w:t/></w:r><w:r><w:tab/></w:r><w:r><w:t>PBDB</w:t></w:r></w:p>`;
    const output = convertPbdbToPbdr(makeDocxBuffer(`<root>${para}</root>`));
    const xml = readXml(output, "word/document.xml");
    // A structural sanity check in place of a full XML parse: every open
    // <w:r> must have a matching close, and the run count must be stable.
    const openRuns = (xml.match(/<w:r(?:\s[^>]*)?>/g) ?? []).length;
    const closeRuns = (xml.match(/<\/w:r>/g) ?? []).length;
    expect(openRuns).toBe(closeRuns);
    expect(xml).toContain("PBDR");
  });
});

describe("convertPbdbToPbdr — replacements applied to headers", () => {
  it("applies text replacements to header1.xml", () => {
    const input = makeDocxBuffer(`<root>${p("body")}</root>`, {
      "word/header1.xml": `<root>${p("Design Brief")}</root>`,
    });
    expect(readXml(convertPbdbToPbdr(input), "word/header1.xml")).toContain("Design Report");
  });

  it("applies text replacements to header2.xml", () => {
    const input = makeDocxBuffer(`<root>${p("body")}</root>`, {
      "word/header2.xml": `<root>${p("PBDB")}</root>`,
    });
    expect(readXml(convertPbdbToPbdr(input), "word/header2.xml")).toContain("PBDR");
  });

  it("ignores non-header XML files for watermark stripping", () => {
    const input = makeDocxBuffer(`<root>${p("Design Brief")}</root>`, {
      "word/footer1.xml": `<root>${p("Footer text")}</root>`,
    });
    const output = convertPbdbToPbdr(input);
    // Document should be transformed; footer is unrelated to watermarks
    expect(readXml(output, "word/document.xml")).toContain("Design Report");
  });
});

describe("convertPbdbToPbdr — watermark removal", () => {
  it("removes VML <w:pict> blocks that contain <v:textpath>", () => {
    const watermark = `<w:pict><v:textpath string="DRAFT"/></w:pict>`;
    const input = makeDocxBuffer(`<root>${p("body")}</root>`, {
      "word/header1.xml": `<root><w:p>${watermark}</w:p></root>`,
    });
    const output = readXml(convertPbdbToPbdr(input), "word/header1.xml");
    expect(output).not.toContain("v:textpath");
    expect(output).not.toContain("w:pict");
  });

  it("removes mc:AlternateContent watermark blocks from headers", () => {
    // Real Word watermarks always carry <v:textpath> in the VML fallback branch.
    const watermark = `<mc:AlternateContent><mc:Choice><p>DrawingML watermark</p></mc:Choice><mc:Fallback><w:pict><v:shape><v:textpath string="DRAFT"/></v:shape></w:pict></mc:Fallback></mc:AlternateContent>`;
    const input = makeDocxBuffer(`<root>${p("body")}</root>`, {
      "word/header2.xml": `<root>${watermark}</root>`,
    });
    const output = readXml(convertPbdbToPbdr(input), "word/header2.xml");
    expect(output).not.toContain("mc:AlternateContent");
  });

  it("preserves non-watermark <w:pict> blocks (those without <v:textpath>)", () => {
    const logo = `<w:pict><v:image src="logo.png" type="image/png"/></w:pict>`;
    const input = makeDocxBuffer(`<root>${p("body")}</root>`, {
      "word/header1.xml": `<root><w:p>${logo}</w:p></root>`,
    });
    const output = readXml(convertPbdbToPbdr(input), "word/header1.xml");
    expect(output).toContain("v:image");
    expect(output).toContain("w:pict");
  });
});

function fieldXml(instr: string, entryBody: string): string {
  return (
    `<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText>${instr}</w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r></w:p>` +
    `<w:p>${entryBody}</w:p>` +
    `<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`
  );
}

describe("makeDocxConversionSafe — shared pre-conversion protections (#118)", () => {
  it("freezes a TOC field, unwrapping hyperlinks but keeping the entry text", () => {
    const entry = `<w:hyperlink><w:r><w:t>Heading 1</w:t></w:r></w:hyperlink>`;
    const input = makeDocxBuffer(`<root>${fieldXml(' TOC \\o "1-3" \\h \\z \\u ', entry)}</root>`);
    const xml = readXml(makeDocxConversionSafe(input), "word/document.xml");
    expect(xml).toContain("Heading 1");
    expect(xml).not.toContain("w:instrText");
    expect(xml).not.toContain("w:hyperlink");
  });

  it("freezes a BIBLIOGRAPHY field the same way", () => {
    const entry = `<w:r><w:t>Smith, J. (2024). Some Reference.</w:t></w:r>`;
    const input = makeDocxBuffer(`<root>${fieldXml(" BIBLIOGRAPHY ", entry)}</root>`);
    const xml = readXml(makeDocxConversionSafe(input), "word/document.xml");
    expect(xml).toContain("Some Reference");
    expect(xml).not.toContain("w:instrText");
  });

  it("strips header watermarks", () => {
    const watermark = `<w:pict><v:textpath string="DRAFT"/></w:pict>`;
    const input = makeDocxBuffer(`<root>${p("body")}</root>`, {
      "word/header1.xml": `<root><w:p>${watermark}</w:p></root>`,
    });
    const output = readXml(makeDocxConversionSafe(input), "word/header1.xml");
    expect(output).not.toContain("v:textpath");
  });

  it("patches the Header style's w:lineRule from auto to atLeast", () => {
    const input = makeDocxBuffer(`<root>${p("body")}</root>`, {
      "word/styles.xml": `<w:styles><w:style w:styleId="Header"><w:pPr><w:spacing w:line="204" w:lineRule="auto"/></w:pPr></w:style></w:styles>`,
    });
    const output = readXml(makeDocxConversionSafe(input), "word/styles.xml");
    expect(output).toContain('w:lineRule="atLeast"');
    expect(output).not.toContain('w:lineRule="auto"');
  });

  it("does not apply PBDB→PBDR text replacements", () => {
    const input = makeDocxBuffer(`<root>${p("Design Brief")}</root>`);
    const xml = readXml(makeDocxConversionSafe(input), "word/document.xml");
    expect(xml).toContain("Design Brief");
    expect(xml).not.toContain("Design Report");
  });
});

describe("convertPbdbToPbdr — output format", () => {
  it("returns a Buffer", () => {
    expect(convertPbdbToPbdr(makeDocxBuffer(`<root></root>`))).toBeInstanceOf(Buffer);
  });

  it("returns a valid PizZip-parseable buffer", () => {
    const result = convertPbdbToPbdr(makeDocxBuffer(`<root>${p("Design Brief")}</root>`));
    expect(() => new PizZip(result)).not.toThrow();
  });

  it("leaves the document.xml file present in the output zip", () => {
    const result = convertPbdbToPbdr(makeDocxBuffer(`<root>${p("text")}</root>`));
    const zip = new PizZip(result);
    expect(zip.files["word/document.xml"]).toBeDefined();
  });
});
