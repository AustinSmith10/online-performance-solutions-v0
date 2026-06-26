import PizZip from "pizzip";

/**
 * Text replacements applied to convert a PBDB into a PBDR.
 * Ordered most-specific first to prevent partial matches corrupting longer
 * target strings (e.g. the full phrase in #6 is matched before bare "Design
 * Brief" in #1/#2/#5).
 */
const REPLACEMENTS: [string, string][] = [
  // #6 — Section 1.1 Introduction Purpose (must precede "Design Brief" catch-all)
  ["Design Brief identifies the proposed", "Design Report evaluates the proposed"],
  // Cover page CoverDocType paragraph uses mixed case (lowercase "design")
  ["performance based design Brief", "performance based design Report"],
  // #1 / #2 / #5 — Cover title banner, cover page title, executive summary
  ["Design Brief", "Design Report"],
  // #4 — Revision History PURPOSE column
  ["Stakeholder Review", "For Construction"],
  // #7 — Section 3 sub-headings
  ["Preliminary Evaluation", "Evaluation"],
  // #8 — Section 3 sub-headings
  ["Preliminary Conclusion", "Conclusion"],
  // #3 — Revision History DOC column (and any other PBDB references in body)
  ["PBDB", "PBDR"],
];

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Applies all PBDB→PBDR text replacements to a single <w:p> element.
 * Concatenates all <w:t> run contents before matching so run-split tokens
 * are handled correctly; places the full replaced text in the first run and
 * removes the now-redundant subsequent runs.
 */
function replaceParagraph(para: string): string {
  const tPattern = /<w:t([^>]*)>([\s\S]*?)<\/w:t>/g;
  type Match = { index: number; length: number; attrs: string; text: string };
  const matches: Match[] = [];
  let m: RegExpExecArray | null;
  while ((m = tPattern.exec(para)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      attrs: m[1],
      text: unescapeXml(m[2]),
    });
  }

  if (matches.length === 0) return para;

  const concatenated = matches.map((x) => x.text).join("");
  let replaced = concatenated;
  for (const [from, to] of REPLACEMENTS) {
    replaced = replaced.split(from).join(to);
  }
  if (replaced === concatenated) return para;

  // Rebuild: put all modified text in the first <w:t>, clear the rest.
  const parts: string[] = [];
  let pos = 0;
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    parts.push(para.slice(pos, match.index));
    if (i === 0) {
      parts.push(`<w:t${match.attrs}>${escapeXml(replaced)}</w:t>`);
    }
    pos = match.index + match.length;
  }
  parts.push(para.slice(pos));
  return parts.join("");
}

function applyTextReplacements(xml: string): string {
  return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, replaceParagraph);
}

/**
 * Strips watermark shapes from a header XML string.
 * Watermarks in Word headers are stored as floating shapes — either old-style
 * <w:pict>/<v:shape> blocks or modern <mc:AlternateContent> (DrawingML + VML
 * fallback). Removing these elements is safe; it leaves the header structure
 * intact but clears the floating shape content.
 */
function removeWatermarks(xml: string): string {
  // Modern DrawingML watermarks wrapped in mc:AlternateContent.
  // Checked FIRST so <v:textpath> detection fires on the original block before
  // the <w:pict> pass below strips it from the VML fallback.
  // Blocks with <v:textpath> are WordArt text watermarks — strip entirely.
  // Non-watermark blocks (DDEG logo + connector group) are kept but patched:
  // behindDoc="1" prevents Gotenberg's LibreOffice from clipping the inline
  // Building Solutions logo — the anchor is positioned at page y=0, above the
  // header content area, and rendering it in front (behindDoc="0") causes
  // Gotenberg to treat its bounding box as a foreground clip over the logo in
  // Para[0]. Behind-text shapes remain visible because header paragraphs have
  // no background fill. The VML fallback z-index is mirrored to negative.
  let result = xml.replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/g, (block) => {
    if (/<v:textpath/i.test(block)) return "";
    return block
      .replace(/\bbehindDoc="0"/g, 'behindDoc="1"')
      .replace(/\bz-index:251742208\b/g, "z-index:-251742208");
  });
  // Remove <w:pict> blocks that contain <v:textpath> (VML WordArt watermarks).
  // Instead of deleting the entire <w:pict> block, surgically remove only the
  // watermark-specific content: the <v:textpath> shapetype and the <v:shape>
  // that references it. Any other <v:shapetype> definitions inside the same
  // <w:pict> (e.g. _x0000_t75 image type used by nearby logo shapes) are
  // preserved so the logo renderer can still find its shapetype.
  result = result.replace(/<w:pict[^>]*>[\s\S]*?<\/w:pict>/g, (block) => {
    if (!/<v:textpath/i.test(block)) return block;
    // Strip <v:shapetype> blocks whose contained <v:textpath> marks them as
    // the WordArt type definition (spt="136").
    let cleaned = block.replace(/<v:shapetype[\s\S]*?<\/v:shapetype>/g, (st) =>
      /<v:textpath/i.test(st) ? "" : st
    );
    // Strip the watermark <v:shape> itself (the one with <v:textpath>).
    cleaned = cleaned.replace(/<v:shape[\s\S]*?<\/v:shape>/g, (sh) =>
      /<v:textpath/i.test(sh) ? "" : sh
    );
    // If the pict now has no meaningful content, or still contains a
    // <v:textpath> that the shape/shapetype cleaning didn't reach (e.g. a
    // bare <v:textpath> directly inside <w:pict>), collapse the block entirely.
    const inner = cleaned.replace(/<w:pict[^>]*>|<\/w:pict>/g, "").trim();
    return (inner && !/<v:textpath/i.test(inner)) ? cleaned : "";
  });
  return result;
}

/**
 * Freezes the live TOC field in document.xml so LibreOffice does not regenerate
 * it with its own default tab-leader style (dots) when rendering via Gotenberg.
 *
 * Word stores the TOC as a field: fldChar(begin) + instrText("TOC ...") +
 * fldChar(separate) + [TOC entry paragraphs] + fldChar(end). LibreOffice sees
 * this as a live field and rewrites the entry paragraphs using its built-in
 * "Contents N" styles, which have dot leaders by default.
 *
 * Removing the four field-marker runs leaves the TOC entry paragraphs as plain
 * static paragraphs styled with the document's custom TOC1/TOC2 styles (which
 * have no dot leaders). The content (heading text + page numbers) is unchanged.
 */
function freezeTocField(xml: string): string {
  // Loop: the document may have more than one TOC field (e.g. a second
  // auto-generated navigation TOC). Freeze each one in turn.
  let result = xml;
  for (;;) {
    const next = freezeOneTocField(result);
    if (next === result) break;
    result = next;
  }
  return result;
}

function freezeOneTocField(xml: string): string {
  // Find the instrText run carrying the TOC or BIBLIOGRAPHY instruction.
  // Both use identical fldChar field structure and both get regenerated by
  // LibreOffice with incorrect default formatting (dot leaders for TOC,
  // garbled entries for BIBLIOGRAPHY).
  const instrRunRe =
    /<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:instrText[^>]*>[^<]*(?:TOC|BIBLIOGRAPHY)\b[\s\S]*?<\/w:instrText><\/w:r>/;
  const instrMatch = instrRunRe.exec(xml);
  if (!instrMatch) return xml;

  const instrRunStart = instrMatch.index;
  const instrRunEnd = instrRunStart + instrMatch[0].length;

  // fldChar(begin) run — immediately before the instrText run
  const beforeInstr = xml.slice(0, instrRunStart);
  const beginRunRe =
    /<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:fldChar\b[^>]*w:fldCharType="begin"[^>]*\/><\/w:r>$/;
  const beginMatch = beginRunRe.exec(beforeInstr);
  const beginRunStart = beginMatch
    ? beforeInstr.length - beginMatch[0].length
    : instrRunStart;

  // fldChar(separate) run — immediately after the instrText run
  const afterInstr = xml.slice(instrRunEnd);
  const sepRunRe =
    /^<w:r\b[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:fldChar\b[^>]*w:fldCharType="separate"[^>]*\/><\/w:r>/;
  const sepMatch = sepRunRe.exec(afterInstr);
  const sepRunEnd = instrRunEnd + (sepMatch ? sepMatch[0].length : 0);

  // fldChar(end) run — depth-count forward from instrRunEnd with depth=1
  // (the outer begin was at beginRunStart, so we start counting from 1).
  let depth = 1;
  const fldRe = /<w:fldChar\b[^>]*w:fldCharType="(begin|end)"[^>]*\/>/g;
  fldRe.lastIndex = instrRunEnd;
  let endRunStart = -1;
  let endRunEnd = -1;
  let m: RegExpExecArray | null;
  while ((m = fldRe.exec(xml)) !== null) {
    if (m[1] === "begin") {
      depth++;
    } else {
      depth--;
      if (depth === 0) {
        // Scan forward for the last <w:r> or <w:r attr> before m.index.
        // Using lastIndexOf("<w:r") would also match <w:rPr>, <w:rFonts>
        // etc., so we scan with a more specific pattern instead.
        const rScan = /<w:r[ >]/g;
        let lastRIdx = -1;
        let rm: RegExpExecArray | null;
        while ((rm = rScan.exec(xml)) !== null && rm.index < m.index) {
          lastRIdx = rm.index;
        }
        endRunStart = lastRIdx;
        endRunEnd = xml.indexOf("</w:r>", m.index) + "</w:r>".length;
        break;
      }
    }
  }
  if (endRunStart === -1) return xml;

  // Clean up the TOC content area (between sep and end): remove w:webHidden
  // (which hides page-number runs in LibreOffice) and w:rStyle Hyperlink (which
  // adds underlines to heading text). Also unwrap <w:hyperlink> elements while
  // keeping their run content so the text stays but loses the hyperlink style.
  let tocContent = xml.slice(sepRunEnd, endRunStart);
  tocContent = tocContent
    .replace(/<w:webHidden\/>/g, "")
    .replace(/<w:rStyle\b[^>]*w:val="Hyperlink"[^>]*\/>/g, "")
    .replace(/<w:hyperlink\b[^>]*>([\s\S]*?)<\/w:hyperlink>/g, "$1");

  // Output = everything before the begin run + cleaned TOC body + everything after the end run.
  // The begin/instrText/separate runs are contiguous, so slicing at beginRunStart
  // and picking back up at endRunEnd correctly removes all four field markers.
  return xml.slice(0, beginRunStart) + tocContent + xml.slice(endRunEnd);
}

/**
 * Transforms a QA'd PBDB .docx buffer into a PBDR .docx buffer by:
 *   1. Applying 8 text replacements to the document body.
 *   2. Stripping watermarks from all header XML files.
 *   3. Freezing the live TOC field so Gotenberg renders the existing styled
 *      entries rather than regenerating with dot-leader defaults.
 *
 * The returned buffer is a valid .docx ready to be sent to Gotenberg for PDF
 * rendering. No storage I/O happens here — callers handle that.
 */
export function convertPbdbToPbdr(docxBuffer: Buffer): Buffer {
  const zip = new PizZip(docxBuffer);

  const docXml = zip.files["word/document.xml"];
  if (docXml) {
    let xml = applyTextReplacements(docXml.asText());
    xml = freezeTocField(xml);
    zip.file("word/document.xml", xml);
  }

  const headerKeys = Object.keys(zip.files).filter((key) =>
    /^word\/header\d+\.xml$/.test(key)
  );
  for (const key of headerKeys) {
    const file = zip.files[key];
    if (!file) continue;
    let xml = file.asText();
    xml = applyTextReplacements(xml);
    xml = removeWatermarks(xml);
    zip.file(key, xml);
  }

  // The Header paragraph style uses w:lineRule="auto" at 85% (204/240), which
  // causes LibreOffice to clip the inline Building Solutions logo to the ~8pt
  // computed line height instead of expanding to fit the 18pt image. Changing
  // to "atLeast" makes LibreOffice treat 204 as a minimum and expand the line
  // box to accommodate larger inline content.
  const stylesFile = zip.files["word/styles.xml"];
  if (stylesFile) {
    const fixed = stylesFile
      .asText()
      .replace(
        /<w:spacing\b([^/]*)w:lineRule="auto"([^/]*)\/>/g,
        (m, before, after) => `<w:spacing${before}w:lineRule="atLeast"${after}/>`
      );
    zip.file("word/styles.xml", fixed);
  }

  return zip.generate({ type: "nodebuffer" }) as Buffer;
}
