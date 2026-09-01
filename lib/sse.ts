// Minimal Server-Sent-Events frame parser, shared by the browser reader in
// the submission upload pipeline. Kept transport-agnostic and pure so it's
// unit-testable: feed it successive chunks of the response body text, get
// back the complete `data:` payloads decoded so far. Only the `data:` field
// is supported — this app's streams don't use event names, ids, or retry.

export class SSEBuffer {
  private buf = "";

  /**
   * Append a chunk of raw stream text and return every complete event whose
   * terminating blank line has now arrived. A trailing partial frame stays
   * buffered for the next call.
   */
  push(chunk: string): string[] {
    this.buf += chunk;
    const out: string[] = [];
    let sep: number;
    // Frames are separated by a blank line — "\n\n" (tolerate "\r\n\r\n").
    while ((sep = firstFrameBreak(this.buf)) !== -1) {
      const rawFrame = this.buf.slice(0, sep);
      this.buf = this.buf.slice(sep).replace(/^(\r?\n){2}/, "");
      const data = rawFrame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) out.push(data);
    }
    return out;
  }
}

function firstFrameBreak(s: string): number {
  const lf = s.indexOf("\n\n");
  const crlf = s.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}
