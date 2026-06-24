import PizZip from "pizzip";

// Word reds used in OPS templates: EE0000 (primary), FF0000, C00000 (dark red)
const RED_COLOR_RE = /<w:color\b[^>]*w:val="(?:FF0000|EE0000|C00000)"[^>]*\/>/gi;

export function stripRedTokenColor(docxBuffer: Buffer): Buffer {
  const zip = new PizZip(docxBuffer);
  for (const [filename, zipFile] of Object.entries(zip.files)) {
    if (/^word\/.*\.xml$/.test(filename) && !(zipFile as { dir: boolean }).dir) {
      const xml = (zipFile as { asText(): string }).asText();
      const stripped = xml.replace(RED_COLOR_RE, "");
      zip.file(filename, stripped);
    }
  }
  return zip.generate({ type: "nodebuffer" }) as Buffer;
}
