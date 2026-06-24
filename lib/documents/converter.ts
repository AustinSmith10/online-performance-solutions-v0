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
  // Remove <w:pict> blocks that contain <v:textpath> — that element is
  // exclusive to VML WordArt watermarks. Blocks without it (logos, line art
  // stored as <v:group> image data) are left untouched.
  let result = xml.replace(/<w:pict[^>]*>[\s\S]*?<\/w:pict>/g, (block) =>
    /<v:textpath/i.test(block) ? "" : block
  );
  // Modern DrawingML watermarks wrapped in mc:AlternateContent.
  // Blocks with <v:textpath> are WordArt text watermarks — strip entirely.
  // All other blocks (logos, connectors) are left untouched; swapping to the
  // VML mc:Fallback was found to crop the Building Solutions logo.
  result = result.replace(/<mc:AlternateContent[\s\S]*?<\/mc:AlternateContent>/g, (block) => {
    if (/<v:textpath/i.test(block)) return "";
    return block;
  });
  return result;
}

/**
 * Transforms a QA'd PBDB .docx buffer into a PBDR .docx buffer by:
 *   1. Applying 8 text replacements to the document body.
 *   2. Stripping watermarks from all header XML files.
 *
 * The returned buffer is a valid .docx ready to be sent to Gotenberg for PDF
 * rendering. No storage I/O happens here — callers handle that.
 */
export function convertPbdbToPbdr(docxBuffer: Buffer): Buffer {
  const zip = new PizZip(docxBuffer);

  const docXml = zip.files["word/document.xml"];
  if (docXml) {
    zip.file("word/document.xml", applyTextReplacements(docXml.asText()));
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

  return zip.generate({ type: "nodebuffer" }) as Buffer;
}
