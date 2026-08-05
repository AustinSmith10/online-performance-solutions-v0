import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import { appendRevisionHistoryRow, setRevisionHistoryRows, setCoverRevisionNumber } from "./revision-table";

function tc(text: string): string {
  return `<w:tc><w:tcPr><w:tcW w:w="1000" w:type="pct"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="P1TableText"/></w:pPr><w:r><w:rPr><w:color w:val="EE0000"/></w:rPr><w:t>${text}</w:t></w:r></w:p></w:tc>`;
}

function headerTc(text: string): string {
  return `<w:tc><w:tcPr><w:tcW w:w="1000" w:type="pct"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="P1TableHeaderrow"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`;
}

function makeTable(rows: string[][]): string {
  const headerRow = `<w:tr>${["DOC", "REV", "DATE", "PURPOSE", "PREPARED BY", "REVIEWED BY"].map(headerTc).join("")}</w:tr>`;
  const dataRows = rows.map((cells) => `<w:tr>${cells.map(tc).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblStyle w:val="DDEGTable1"/></w:tblPr>${headerRow}${dataRows}</w:tbl>`;
}

function makeDocxBuffer(documentXmlBody: string): Buffer {
  const zip = new PizZip();
  zip.file("word/document.xml", `<w:document><w:body>${documentXmlBody}</w:body></w:document>`);
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}

function extractDocumentXml(buf: Buffer): string {
  const zip = new PizZip(buf);
  return zip.files["word/document.xml"].asText();
}

function tableRowTexts(xml: string): string[][] {
  const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) ?? [];
  const tblXml = tables.find((t) => t.includes("REVIEWED BY"));
  if (!tblXml) return [];
  const trMatches = tblXml.match(/<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g) ?? [];
  return trMatches.map((tr) => {
    const tcMatches = tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) ?? [];
    return tcMatches.map((cellXml) => {
      const texts = [...cellXml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]);
      return texts.join("");
    });
  });
}

const NEW_ROW = {
  docType: "PBDB",
  revNumber: "1",
  date: "05/08/2026",
  purpose: "Stakeholder Review",
  preparedBy: "John Snow",
};

describe("appendRevisionHistoryRow", () => {
  it("appends a new row after the last existing row", () => {
    const table = makeTable([["PBDB", "0", "04/08/2026", "Stakeholder Review", "John Snow", "Kieran Doherty"]]);
    const buf = makeDocxBuffer(table);

    const out = appendRevisionHistoryRow(buf, NEW_ROW);
    const rows = tableRowTexts(extractDocumentXml(out));

    expect(rows).toHaveLength(3); // header + original row + new row
    expect(rows[2]).toEqual(["PBDB", "1", "05/08/2026", "Stakeholder Review", "John Snow", "Kieran Doherty"]);
  });

  it("preserves REVIEWED BY unchanged (copies the last row's value verbatim)", () => {
    const table = makeTable([["PBDB", "0", "04/08/2026", "Stakeholder Review", "John Snow", "Someone Else"]]);
    const buf = makeDocxBuffer(table);

    const out = appendRevisionHistoryRow(buf, NEW_ROW);
    const rows = tableRowTexts(extractDocumentXml(out));

    expect(rows[2][5]).toBe("Someone Else");
  });

  it("adds a PBDR row correctly after PBDB rows", () => {
    const table = makeTable([
      ["PBDB", "0", "04/08/2026", "Stakeholder Review", "John Snow", "Kieran Doherty"],
      ["PBDB", "1", "05/08/2026", "Stakeholder Review", "John Snow", "Kieran Doherty"],
    ]);
    const buf = makeDocxBuffer(table);

    const out = appendRevisionHistoryRow(buf, {
      docType: "PBDR",
      revNumber: "0",
      date: "06/08/2026",
      purpose: "For Construction",
      preparedBy: "John Snow",
    });
    const rows = tableRowTexts(extractDocumentXml(out));

    expect(rows).toHaveLength(4);
    expect(rows[3]).toEqual(["PBDR", "0", "06/08/2026", "For Construction", "John Snow", "Kieran Doherty"]);
  });

  it("is idempotent — skips appending when the last row already matches (forced resend, no new rev)", () => {
    const table = makeTable([["PBDB", "1", "04/08/2026", "Stakeholder Review", "John Snow", "Kieran Doherty"]]);
    const buf = makeDocxBuffer(table);

    const out = appendRevisionHistoryRow(buf, {
      ...NEW_ROW,
      revNumber: "1", // same rev as the existing last row
    });
    const rows = tableRowTexts(extractDocumentXml(out));

    expect(rows).toHaveLength(2); // unchanged — header + the one existing row
  });

  it("only touches cells within the identified revision-history table, not other tables", () => {
    const unrelatedTable = `<w:tbl><w:tblPr/><w:tr>${headerTc("Name")}${headerTc("Value")}</w:tr><w:tr>${tc("Foo")}${tc("Bar")}</w:tr></w:tbl>`;
    const table = makeTable([["PBDB", "0", "04/08/2026", "Stakeholder Review", "John Snow", "Kieran Doherty"]]);
    const buf = makeDocxBuffer(unrelatedTable + table);

    const out = appendRevisionHistoryRow(buf, NEW_ROW);
    const xml = extractDocumentXml(out);

    // Unrelated table untouched
    expect(xml).toContain("<w:t>Foo</w:t>");
    expect(xml).toContain("<w:t>Bar</w:t>");
    const rows = tableRowTexts(xml);
    expect(rows[2]).toEqual(["PBDB", "1", "05/08/2026", "Stakeholder Review", "John Snow", "Kieran Doherty"]);
  });

  it("returns the buffer unchanged when no revision-history table is found", () => {
    const buf = makeDocxBuffer(`<w:p><w:r><w:t>No tables here.</w:t></w:r></w:p>`);
    const out = appendRevisionHistoryRow(buf, NEW_ROW);
    expect(out.equals(buf)).toBe(true);
  });

  it("returns the buffer unchanged (never throws) on a malformed/non-docx buffer", () => {
    const bogus = Buffer.from("not a zip file at all");
    expect(() => appendRevisionHistoryRow(bogus, NEW_ROW)).not.toThrow();
    const out = appendRevisionHistoryRow(bogus, NEW_ROW);
    expect(out.equals(bogus)).toBe(true);
  });
});

describe("setRevisionHistoryRows", () => {
  it("replaces a single carried-over row with the full PBDR-only history", () => {
    // Simulates what convertPbdbToPbdr() hands off: the PBDB's own row,
    // text-swapped but not yet a real PBDR revision.
    const table = makeTable([["PBDR", "1", "04/08/2026", "For Construction", "John Snow", "Kieran Doherty"]]);
    const buf = makeDocxBuffer(table);

    const out = setRevisionHistoryRows(buf, [
      { docType: "PBDR", revNumber: "0", date: "21/07/2026", purpose: "For Construction", preparedBy: "John Snow" },
      { docType: "PBDR", revNumber: "1", date: "05/08/2026", purpose: "For Construction", preparedBy: "John Snow" },
    ]);
    const rows = tableRowTexts(extractDocumentXml(out));

    expect(rows).toHaveLength(3); // header + 2 rebuilt rows
    expect(rows[1]).toEqual(["PBDR", "0", "21/07/2026", "For Construction", "John Snow", ""]);
    expect(rows[2]).toEqual(["PBDR", "1", "05/08/2026", "For Construction", "John Snow", ""]);
  });

  it("blanks REVIEWED BY on every rebuilt row rather than copying the source row's value", () => {
    const table = makeTable([["PBDR", "0", "04/08/2026", "For Construction", "John Snow", "Someone Else"]]);
    const buf = makeDocxBuffer(table);

    const out = setRevisionHistoryRows(buf, [
      { docType: "PBDR", revNumber: "0", date: "04/08/2026", purpose: "For Construction", preparedBy: "John Snow" },
    ]);
    const rows = tableRowTexts(extractDocumentXml(out));

    expect(rows[1][5]).toBe("");
  });

  it("replaces multiple existing rows (a re-conversion after a revert) with a freshly built set", () => {
    const table = makeTable([
      ["PBDR", "0", "04/08/2026", "For Construction", "John Snow", "Kieran Doherty"],
      ["PBDR", "1", "05/08/2026", "For Construction", "John Snow", "Kieran Doherty"],
    ]);
    const buf = makeDocxBuffer(table);

    const out = setRevisionHistoryRows(buf, [
      { docType: "PBDR", revNumber: "0", date: "04/08/2026", purpose: "For Construction", preparedBy: "John Snow" },
    ]);
    const rows = tableRowTexts(extractDocumentXml(out));

    expect(rows).toHaveLength(2); // header + the single row from the fresh set, old second row gone
  });

  it("only touches cells within the identified revision-history table, not other tables", () => {
    const unrelatedTable = `<w:tbl><w:tblPr/><w:tr>${headerTc("Name")}${headerTc("Value")}</w:tr><w:tr>${tc("Foo")}${tc("Bar")}</w:tr></w:tbl>`;
    const table = makeTable([["PBDR", "0", "04/08/2026", "For Construction", "John Snow", "Kieran Doherty"]]);
    const buf = makeDocxBuffer(unrelatedTable + table);

    const out = setRevisionHistoryRows(buf, [
      { docType: "PBDR", revNumber: "0", date: "04/08/2026", purpose: "For Construction", preparedBy: "John Snow" },
    ]);
    const xml = extractDocumentXml(out);

    expect(xml).toContain("<w:t>Foo</w:t>");
    expect(xml).toContain("<w:t>Bar</w:t>");
  });

  it("returns the buffer unchanged when no revision-history table is found", () => {
    const buf = makeDocxBuffer(`<w:p><w:r><w:t>No tables here.</w:t></w:r></w:p>`);
    const out = setRevisionHistoryRows(buf, [
      { docType: "PBDR", revNumber: "0", date: "04/08/2026", purpose: "For Construction", preparedBy: "John Snow" },
    ]);
    expect(out.equals(buf)).toBe(true);
  });

  it("returns the buffer unchanged (never throws) on a malformed/non-docx buffer", () => {
    const bogus = Buffer.from("not a zip file at all");
    const rows = [
      { docType: "PBDR", revNumber: "0", date: "04/08/2026", purpose: "For Construction", preparedBy: "John Snow" },
    ];
    expect(() => setRevisionHistoryRows(bogus, rows)).not.toThrow();
    expect(setRevisionHistoryRows(bogus, rows).equals(bogus)).toBe(true);
  });
});

function coverLabelRow(label: string, value: string): string {
  return `<w:tr><w:tc><w:tcPr><w:tcW w:w="822" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="CoverTableHeading"/></w:pPr><w:r><w:t>${label}</w:t></w:r></w:p></w:tc><w:tc><w:tcPr><w:tcW w:w="2835" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="CoverPageText"/></w:pPr><w:r><w:rPr><w:color w:val="EE0000"/></w:rPr><w:t xml:space="preserve">${value}</w:t></w:r></w:p></w:tc></w:tr>`;
}

describe("setCoverRevisionNumber", () => {
  it("patches the value cell of the row labeled 'Revision'", () => {
    const table = `<w:tbl>${coverLabelRow("Address", "123 Main St")}${coverLabelRow("Project no.", "789-S")}${coverLabelRow("Date", "04/08/2026")}${coverLabelRow("Revision", "0")}</w:tbl>`;
    const buf = makeDocxBuffer(table);

    const out = setCoverRevisionNumber(buf, "2");
    const xml = extractDocumentXml(out);

    expect(xml).toContain("<w:t xml:space=\"preserve\">2</w:t>");
    // Unrelated rows are untouched
    expect(xml).toContain("123 Main St");
    expect(xml).toContain("789-S");
    expect(xml).toContain("04/08/2026");
  });

  it("does not touch a 'Revision history' heading row, only an exact 'Revision' label", () => {
    const table = `<w:tbl>${coverLabelRow("Revision history", "n/a")}${coverLabelRow("Revision", "0")}</w:tbl>`;
    const buf = makeDocxBuffer(table);

    const out = setCoverRevisionNumber(buf, "3");
    const xml = extractDocumentXml(out);

    expect(xml).toContain("n/a"); // "Revision history" row's value cell untouched
    expect(xml).toContain("<w:t xml:space=\"preserve\">3</w:t>");
    expect(xml).not.toContain("<w:t xml:space=\"preserve\">0</w:t>");
  });

  it("returns the buffer unchanged when no 'Revision' row is found", () => {
    const table = `<w:tbl>${coverLabelRow("Address", "123 Main St")}</w:tbl>`;
    const buf = makeDocxBuffer(table);
    const out = setCoverRevisionNumber(buf, "1");
    expect(out.equals(buf)).toBe(true);
  });

  it("returns the buffer unchanged (never throws) on a malformed/non-docx buffer", () => {
    const bogus = Buffer.from("not a zip file at all");
    expect(() => setCoverRevisionNumber(bogus, "1")).not.toThrow();
    expect(setCoverRevisionNumber(bogus, "1").equals(bogus)).toBe(true);
  });
});
