import PizZip from "pizzip";

/**
 * Appends a new row to the Revision History table inside a consultant's
 * re-uploaded QA'd PBDB .docx.
 *
 * Re-uploads are NOT re-rendered through docxtemplater (that would wipe out
 * the consultant's manual edits to the document body) — generatePbdb() only
 * ever renders the table once, at the project's very first generation. So
 * without this, the table permanently stays frozen at its Rev0 row no
 * matter how many revision cycles the project goes through. This performs
 * targeted XML surgery instead: it clones the table's last existing row
 * (to inherit its cell formatting) and overwrites five of its six cells
 * with the new revision's values, leaving REVIEWED BY untouched (it's a
 * fixed manual field in the template, not data-driven per row).
 *
 * Identifies the table by its header row's cell text ("DOC", "REV",
 * "PURPOSE" all present) rather than any fixed position, so it's resilient
 * to the table moving around the document. Returns the buffer unchanged
 * (with a console.warn) if no matching table or no existing row is found —
 * this must never throw and block an otherwise-valid upload.
 */
export function appendRevisionHistoryRow(
  docxBuffer: Buffer,
  row: {
    docType: string;
    revNumber: string;
    date: string;
    purpose: string;
    preparedBy: string;
  }
): Buffer {
  try {
    const zip = new PizZip(docxBuffer);
    const docFile = zip.files["word/document.xml"];
    if (!docFile) return docxBuffer;

    const xml = docFile.asText();
    const patched = insertRevisionRow(xml, row);
    if (patched === null) {
      console.warn(
        "[revision-table] Could not locate the Revision History table (or its last row) — leaving the document unchanged."
      );
      return docxBuffer;
    }

    zip.file("word/document.xml", patched);
    return zip.generate({ type: "nodebuffer" }) as Buffer;
  } catch (err) {
    // Must never throw and block an otherwise-valid upload — a malformed or
    // unreadable .docx just means the revision table doesn't get its new row.
    console.warn("[revision-table] Failed to append revision row — leaving the document unchanged.", err);
    return docxBuffer;
  }
}

/**
 * Patches the cover page's scalar "Revision" value (SYS_REV_NO — rendered
 * once via docxtemplater at initial generation and never touched again) to
 * the given number. Without this, the cover keeps showing "0" forever no
 * matter how many revisions the document has actually been through, even
 * after the Revision History table below it has correctly grown.
 *
 * The cover renders this as a two-cell table row: a label cell ("Revision")
 * and a value cell next to it. Identifies the row by that exact label text
 * rather than any fixed position, and only touches the first match — never
 * throws, a missing/unrecognized row just leaves the document unchanged.
 */
export function setCoverRevisionNumber(docxBuffer: Buffer, revNumber: string): Buffer {
  try {
    const zip = new PizZip(docxBuffer);
    const docFile = zip.files["word/document.xml"];
    if (!docFile) return docxBuffer;

    const xml = docFile.asText();
    const patched = patchCoverRevisionRow(xml, revNumber);
    if (patched === null) {
      console.warn(
        "[revision-table] Could not locate the cover page's Revision field — leaving the document unchanged."
      );
      return docxBuffer;
    }

    zip.file("word/document.xml", patched);
    return zip.generate({ type: "nodebuffer" }) as Buffer;
  } catch (err) {
    console.warn(
      "[revision-table] Failed to patch the cover page's Revision field — leaving the document unchanged.",
      err
    );
    return docxBuffer;
  }
}

function patchCoverRevisionRow(xml: string, revNumber: string): string | null {
  const rows = matchTopLevel(xml, "w:tr");

  for (const row of rows) {
    const cells = matchTopLevel(row, "w:tc");
    if (cells.length < 2) continue;

    const label = cellTexts(row)[0]?.trim().toLowerCase();
    if (label !== "revision") continue;

    const valueCell = cells[1];
    const newCell = rebuildCell(valueCell, revNumber);
    const cellStart = row.indexOf(valueCell);
    if (cellStart === -1) continue;
    const newRow = row.slice(0, cellStart) + newCell + row.slice(cellStart + valueCell.length);

    const rowStart = xml.indexOf(row);
    if (rowStart === -1) continue;
    return xml.slice(0, rowStart) + newRow + xml.slice(rowStart + row.length);
  }

  return null;
}

/**
 * Rebuilds the Revision History table's data rows from scratch, replacing
 * whatever is currently there with exactly the given rows.
 *
 * Used for PBDR conversion, not PBDB reuploads: a PBDR is produced by
 * literal text-swap of an already-rendered PBDB .docx (see converter.ts),
 * not a fresh docxtemplater render, so the table it inherits still holds the
 * PBDB's own rows (just with "Stakeholder Review" text-swapped to "For
 * Construction"). Those aren't real PBDR revision rows, so appending to them
 * would be wrong — the whole data-row set needs replacing with the
 * project's actual PBDR-only history instead. See lib/documents/delivery.ts.
 *
 * Clones the table's last existing row purely for cell formatting, so the
 * table's original styling carries into however many rows `rows` produces.
 * REVIEWED BY is left blank on every row — it's a fixed manual field per the
 * template, and the source row's value (if any) belongs to a PBDB row, not
 * a PBDR one. Never throws — a malformed or unrecognized table just leaves
 * the document unchanged.
 */
export function setRevisionHistoryRows(
  docxBuffer: Buffer,
  rows: {
    docType: string;
    revNumber: string;
    date: string;
    purpose: string;
    preparedBy: string;
  }[]
): Buffer {
  try {
    const zip = new PizZip(docxBuffer);
    const docFile = zip.files["word/document.xml"];
    if (!docFile) return docxBuffer;

    const xml = docFile.asText();
    const patched = replaceRevisionRows(xml, rows);
    if (patched === null) {
      console.warn(
        "[revision-table] Could not locate the Revision History table (or a row to use as a formatting template) — leaving the document unchanged."
      );
      return docxBuffer;
    }

    zip.file("word/document.xml", patched);
    return zip.generate({ type: "nodebuffer" }) as Buffer;
  } catch (err) {
    console.warn("[revision-table] Failed to rebuild the revision history table — leaving the document unchanged.", err);
    return docxBuffer;
  }
}

function replaceRevisionRows(
  xml: string,
  rows: { docType: string; revNumber: string; date: string; purpose: string; preparedBy: string }[]
): string | null {
  const tableRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRe.exec(xml)) !== null) {
    const tableXml = tableMatch[0];
    const allRows = matchTopLevel(tableXml, "w:tr");
    if (allRows.length < 2) continue; // need at least a header + one data row to use as a template

    const headerText = cellTexts(allRows[0]).map((t) => t.trim().toUpperCase());
    const isRevisionTable =
      headerText.some((t) => t === "DOC") &&
      headerText.some((t) => t === "REV") &&
      headerText.some((t) => t === "PURPOSE");
    if (!isRevisionTable) continue;

    const templateRow = allRows[allRows.length - 1];
    const templateCells = matchTopLevel(templateRow, "w:tc");
    if (templateCells.length < 6) return null;

    const trOpenMatch = /^<w:tr\b[^>]*>/.exec(templateRow);
    const trOpen = trOpenMatch
      ? trOpenMatch[0].replace(/w14:paraId="[^"]*"/, "").replace(/w14:textId="[^"]*"/, "")
      : "<w:tr>";

    const newRowsXml = rows
      .map((row) => {
        const values = [row.docType, row.revNumber, row.date, row.purpose, row.preparedBy, ""];
        const newCells = templateCells.map((cell, i) => rebuildCell(cell, values[i] ?? ""));
        return `${trOpen}${newCells.join("")}</w:tr>`;
      })
      .join("");

    const headerRow = allRows[0];
    const headerEnd = tableXml.indexOf(headerRow) + headerRow.length;
    const lastDataRowEnd = tableXml.lastIndexOf(templateRow) + templateRow.length;

    const newTableXml = tableXml.slice(0, headerEnd) + newRowsXml + tableXml.slice(lastDataRowEnd);

    return xml.slice(0, tableMatch.index) + newTableXml + xml.slice(tableMatch.index + tableXml.length);
  }

  return null;
}

function insertRevisionRow(
  xml: string,
  row: { docType: string; revNumber: string; date: string; purpose: string; preparedBy: string }
): string | null {
  const tableRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g;
  let tableMatch: RegExpExecArray | null;

  while ((tableMatch = tableRe.exec(xml)) !== null) {
    const tableXml = tableMatch[0];
    const rows = matchTopLevel(tableXml, "w:tr");
    if (rows.length < 2) continue; // need at least a header + one data row

    const headerText = cellTexts(rows[0]).map((t) => t.trim().toUpperCase());
    const isRevisionTable =
      headerText.some((t) => t === "DOC") &&
      headerText.some((t) => t === "REV") &&
      headerText.some((t) => t === "PURPOSE");
    if (!isRevisionTable) continue;

    const lastRow = rows[rows.length - 1];
    const cells = matchTopLevel(lastRow, "w:tc");
    if (cells.length < 6) return null;

    // Idempotent: a "forced resend" reupload (no rejection happened, the
    // revision_history counter is unchanged) re-uploads a docx whose table
    // already ends with this exact DOC/REV — skip appending a duplicate row.
    // A genuine post-rejection reupload's docx still shows the OLD rev as
    // its last row (the consultant edited the previous version), so this
    // only skips the true no-op case.
    const lastRowValues = cellTexts(lastRow).map((t) => t.trim());
    if (lastRowValues[0] === row.docType && lastRowValues[1] === row.revNumber) {
      return xml;
    }

    const values = [row.docType, row.revNumber, row.date, row.purpose, row.preparedBy];
    const newCells = cells.map((cell, i) => (i < values.length ? rebuildCell(cell, values[i]) : cell));

    const trOpenMatch = /^<w:tr\b[^>]*>/.exec(lastRow);
    const trOpen = trOpenMatch ? trOpenMatch[0].replace(/w14:paraId="[^"]*"/, "").replace(/w14:textId="[^"]*"/, "") : "<w:tr>";
    const newRow = `${trOpen}${newCells.join("")}</w:tr>`;

    const lastRowStart = tableXml.lastIndexOf(lastRow);
    const lastRowEnd = lastRowStart + lastRow.length;
    const newTableXml = tableXml.slice(0, lastRowEnd) + newRow + tableXml.slice(lastRowEnd);

    return xml.slice(0, tableMatch.index) + newTableXml + xml.slice(tableMatch.index + tableXml.length);
  }

  return null;
}

/** Matches top-level (non-nested) occurrences of a simple tag like "w:tr" or "w:tc" within an XML fragment. */
function matchTopLevel(xml: string, tag: string): string[] {
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, "g");
  const closeTag = `</${tag}>`;
  const results: string[] = [];
  let m: RegExpExecArray | null;
  let searchFrom = 0;

  while ((m = openRe.exec(xml)) !== null) {
    if (m.index < searchFrom) continue;
    let depth = 1;
    let pos = m.index + m[0].length;
    while (depth > 0) {
      const nextOpen = xml.indexOf(`<${tag}`, pos);
      const nextClose = xml.indexOf(closeTag, pos);
      if (nextClose === -1) return results; // malformed — bail with what we have
      if (nextOpen !== -1 && nextOpen < nextClose && /^<[\w:]+(\s|>|\/)/.test(xml.slice(nextOpen, nextOpen + tag.length + 2))) {
        depth++;
        pos = nextOpen + 1;
      } else {
        depth--;
        pos = nextClose + closeTag.length;
      }
    }
    results.push(xml.slice(m.index, pos));
    searchFrom = pos;
    openRe.lastIndex = pos;
  }
  return results;
}

function cellTexts(rowXml: string): string[] {
  return matchTopLevel(rowXml, "w:tc").map((cell) => {
    const texts = [...cell.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => unescapeXml(m[1]));
    return texts.join("");
  });
}

function rebuildCell(cellXml: string, newText: string): string {
  const tcPrMatch = /<w:tcPr>[\s\S]*?<\/w:tcPr>/.exec(cellXml);
  const tcPr = tcPrMatch ? tcPrMatch[0] : "";

  const firstParaMatch = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/.exec(cellXml);
  if (!firstParaMatch) return cellXml;

  const pPrMatch = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(firstParaMatch[0]);
  const pPr = pPrMatch ? pPrMatch[0] : "";

  const firstRunMatch = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/.exec(firstParaMatch[0]);
  const rPrMatch = firstRunMatch ? /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(firstRunMatch[0]) : null;
  const rPr = rPrMatch ? rPrMatch[0] : "";

  const newParagraph = `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(newText)}</w:t></w:r></w:p>`;
  return `<w:tc>${tcPr}${newParagraph}</w:tc>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
