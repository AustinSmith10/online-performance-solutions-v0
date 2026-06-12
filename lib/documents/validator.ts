import PizZip from "pizzip";

// Matches {Token}, {TOKEN}, {token_name}, {Mixed_Case} etc.
const TOKEN_PATTERN = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/**
 * Extracts all unique {TOKEN} placeholders from a .docx file buffer.
 *
 * Word frequently splits a single token across multiple XML runs, e.g.
 * {Site_ and Address} in separate <w:r> elements. We concatenate all
 * <w:t> text within each <w:p> paragraph before matching to handle this.
 */
export async function extractPlaceholderTokens(docxBuffer: ArrayBuffer): Promise<string[]> {
  const zip = new PizZip(docxBuffer);
  const tokens = new Set<string>();

  const partsToSearch = [
    "word/document.xml",
    "word/header1.xml",
    "word/header2.xml",
    "word/header3.xml",
    "word/footer1.xml",
    "word/footer2.xml",
    "word/footer3.xml",
  ];

  for (const part of partsToSearch) {
    const file = zip.files[part];
    if (!file) continue;

    for (const text of extractParagraphTexts(file.asText())) {
      for (const match of text.matchAll(TOKEN_PATTERN)) {
        tokens.add(match[1]);
      }
    }
  }

  return [...tokens].sort();
}

/**
 * Pulls the concatenated plain text out of every <w:p> in an XML string.
 * Joins all <w:t> runs within a paragraph so split tokens are reunited.
 */
function extractParagraphTexts(xml: string): string[] {
  const texts: string[] = [];
  const paragraphRegex = /<w:p[ >][\s\S]*?<\/w:p>/g;

  for (const pMatch of xml.matchAll(paragraphRegex)) {
    let text = "";
    const textRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g;
    for (const tMatch of pMatch[0].matchAll(textRegex)) {
      text += tMatch[1];
    }
    if (text) texts.push(text);
  }

  return texts;
}
