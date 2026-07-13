// Minimal RFC822 body extractor — no mail-parsing dependency. Good enough for
// typical "save as .eml" exports (Gmail/Outlook): splits headers from body,
// decodes base64/quoted-printable, and for multipart messages picks the first
// text/plain part. Falls back to the raw body text if the structure isn't
// recognized.

function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBase64(text: string): string {
  try {
    return Buffer.from(text.replace(/\s+/g, ""), "base64").toString("utf-8");
  } catch {
    return text;
  }
}

function splitHeadersAndBody(raw: string): { headers: string; body: string } {
  const idx = raw.search(/\r?\n\r?\n/);
  if (idx === -1) return { headers: raw, body: "" };
  const match = raw.slice(idx).match(/^\r?\n\r?\n/);
  const sepLen = match ? match[0].length : 2;
  return { headers: raw.slice(0, idx), body: raw.slice(idx + sepLen) };
}

function getHeader(headers: string, name: string): string | null {
  // Unfold header continuation lines (leading whitespace) before matching.
  const unfolded = headers.replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp(`^${name}:\\s*(.*)$`, "im");
  const match = unfolded.match(re);
  return match ? match[1].trim() : null;
}

function decodeByTransferEncoding(body: string, encoding: string | null): string {
  switch ((encoding ?? "").toLowerCase()) {
    case "base64":
      return decodeBase64(body);
    case "quoted-printable":
      return decodeQuotedPrintable(body);
    default:
      return body;
  }
}

function extractPlainTextPart(contentType: string, body: string): string | null {
  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
  if (!boundaryMatch) return null;
  const boundary = boundaryMatch[1];
  const parts = body.split(`--${boundary}`).slice(1, -1);

  let fallback: string | null = null;
  for (const part of parts) {
    const { headers: partHeaders, body: partBody } = splitHeadersAndBody(part.replace(/^\r?\n/, ""));
    const partType = (getHeader(partHeaders, "Content-Type") ?? "text/plain").toLowerCase();
    const partEncoding = getHeader(partHeaders, "Content-Transfer-Encoding");

    if (partType.startsWith("multipart/")) {
      const nested = extractPlainTextPart(partType, partBody);
      if (nested) return nested;
      continue;
    }
    if (partType.startsWith("text/plain")) {
      return decodeByTransferEncoding(partBody, partEncoding).trim();
    }
    if (partType.startsWith("text/html") && fallback === null) {
      fallback = stripHtml(decodeByTransferEncoding(partBody, partEncoding));
    }
  }
  return fallback;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseEmlBody(raw: string): string {
  const { headers, body } = splitHeadersAndBody(raw);
  const contentType = (getHeader(headers, "Content-Type") ?? "text/plain").toLowerCase();
  const encoding = getHeader(headers, "Content-Transfer-Encoding");

  if (contentType.startsWith("multipart/")) {
    const extracted = extractPlainTextPart(contentType, body);
    if (extracted) return extracted;
    return body.trim();
  }

  if (contentType.startsWith("text/html")) {
    return stripHtml(decodeByTransferEncoding(body, encoding));
  }

  return decodeByTransferEncoding(body, encoding).trim();
}
