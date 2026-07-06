import { spawn } from "child_process";
import { writeFile, readFile, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

/**
 * Sends a .docx buffer to Gotenberg's LibreOffice convert endpoint and
 * returns the resulting PDF as a Buffer. Enforces a 60-second hard timeout.
 */
async function convertViaGotenberg(docxBuffer: Buffer, gotenbergUrl: string): Promise<Buffer> {
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

/**
 * Converts a .docx buffer to PDF using a local LibreOffice headless subprocess.
 * Fallback for development environments where Gotenberg is not running.
 */
async function convertViaLibreOffice(docxBuffer: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "ops-pdf-"));
  const inputPath = join(dir, "document.docx");
  const outputPath = join(dir, "document.pdf");

  try {
    await writeFile(inputPath, docxBuffer);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("soffice", [
        "--headless",
        "--convert-to", "pdf",
        "--outdir", dir,
        inputPath,
      ]);
      let stderr = "";
      proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`LibreOffice exited with code ${code}: ${stderr.trim()}`));
      });
      proc.on("error", (err) => reject(new Error(`Failed to spawn soffice: ${err.message}`)));
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Sends an HTML string to Gotenberg's Chromium HTML convert endpoint and
 * returns the resulting PDF as a Buffer. Enforces a 60-second hard timeout.
 */
async function convertHtmlViaGotenberg(html: string, gotenbergUrl: string): Promise<Buffer> {
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(`${gotenbergUrl}/forms/chromium/convert/html`, {
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

/**
 * Converts an HTML string to PDF using a local LibreOffice headless subprocess.
 * Fallback for development environments where Gotenberg is not running.
 */
async function convertHtmlViaLibreOffice(html: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "ops-pdf-"));
  const inputPath = join(dir, "document.html");
  const outputPath = join(dir, "document.pdf");

  try {
    await writeFile(inputPath, html, "utf-8");

    await new Promise<void>((resolve, reject) => {
      const proc = spawn("soffice", [
        "--headless",
        "--convert-to", "pdf",
        "--outdir", dir,
        inputPath,
      ]);
      let stderr = "";
      proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`LibreOffice exited with code ${code}: ${stderr.trim()}`));
      });
      proc.on("error", (err) => reject(new Error(`Failed to spawn soffice: ${err.message}`)));
    });

    return await readFile(outputPath);
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

function isConnectionRefused(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const cause = (err as { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object") return false;
  return (cause as { code?: string }).code === "ECONNREFUSED";
}

/**
 * Converts a .docx buffer to PDF.
 * Uses Gotenberg if GOTENBERG_URL is set and reachable; falls back to a local
 * LibreOffice subprocess (soffice --headless) if the connection is refused.
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const gotenbergUrl = process.env.GOTENBERG_URL;

  if (gotenbergUrl) {
    try {
      return await convertViaGotenberg(docxBuffer, gotenbergUrl);
    } catch (err) {
      if (!isConnectionRefused(err)) throw err;
      console.warn("[pdf] Gotenberg unreachable — falling back to local LibreOffice");
    }
  }

  return convertViaLibreOffice(docxBuffer);
}

/**
 * Converts an HTML string to PDF.
 * Uses Gotenberg (Chromium) if GOTENBERG_URL is set and reachable; falls back
 * to a local LibreOffice subprocess (soffice --headless) if the connection is
 * refused — used for generating locked-down PDF renderings (e.g. audit-trail
 * exports) that aren't trivially editable the way a CSV is.
 */
export async function convertHtmlToPdf(html: string): Promise<Buffer> {
  const gotenbergUrl = process.env.GOTENBERG_URL;

  if (gotenbergUrl) {
    try {
      return await convertHtmlViaGotenberg(html, gotenbergUrl);
    } catch (err) {
      if (!isConnectionRefused(err)) throw err;
      console.warn("[pdf] Gotenberg unreachable — falling back to local LibreOffice");
    }
  }

  return convertHtmlViaLibreOffice(html);
}
