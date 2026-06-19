import "server-only";

/**
 * Sends a .docx buffer to Gotenberg's LibreOffice convert endpoint and
 * returns the resulting PDF as a Buffer. Enforces a 60-second hard timeout
 * per the issue specification.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const gotenbergUrl = process.env.GOTENBERG_URL;
  if (!gotenbergUrl) throw new Error("GOTENBERG_URL is not configured");

  // Use a Uint8Array view so TypeScript resolves to ArrayBuffer (not SharedArrayBuffer).
  const form = new FormData();
  form.append(
    "files",
    new Blob([new Uint8Array(docxBuffer)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    "document.docx"
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${gotenbergUrl}/forms/libreoffice/convert`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      const msg = await response.text().catch(() => "unknown");
      throw new Error(`Gotenberg returned ${response.status}: ${msg}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Gotenberg conversion timed out after 60 seconds");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
