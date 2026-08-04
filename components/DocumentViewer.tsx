"use client";

import { useEffect, useRef, useState } from "react";

type PreviewKind = "pdf" | "image" | "unsupported";

function detectKind(filename?: string | null, src?: string | null): PreviewKind {
  const name = filename || src || "";
  const ext = name.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return "image";
  return "unsupported";
}

/** Whether DocumentViewer can render this file inline (vs. a download-only fallback). */
export function isPreviewable(filename?: string | null, src?: string | null): boolean {
  return detectKind(filename, src) !== "unsupported";
}

interface DocumentViewerProps {
  /** Signed URL (or any fetchable URL) for the document bytes. */
  src: string;
  /** Used to detect the file type — falls back to sniffing `src` if omitted. */
  filename?: string | null;
  className?: string;
}

/**
 * Generic inline document preview. Renders PDF via PDF.js canvas rendering
 * (never a native iframe/embed — unreliable on mobile Safari) and PNG/JPEG
 * as plain images. Anything else (TIFF, docx, unknown) gets a "preview not
 * available" fallback with a download link — this component never attempts
 * to render native docx.
 */
export function DocumentViewer({ src, filename, className = "" }: DocumentViewerProps) {
  const kind = detectKind(filename, src);

  if (kind === "pdf") {
    return <PdfCanvasViewer src={src} className={className} />;
  }

  if (kind === "image") {
    return (
      <div className={`flex justify-center overflow-auto bg-zinc-50 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary signed-URL source, not a static asset */}
        <img src={src} alt={filename ?? "Document preview"} className="max-w-full object-contain" />
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center gap-3 bg-zinc-50 px-6 py-12 text-center ${className}`}>
      <p className="text-sm text-zinc-500">Preview not available for this file format.</p>
      <a
        href={src}
        download={filename ?? undefined}
        className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Download instead
      </a>
    </div>
  );
}

function PdfCanvasViewer({ src, className }: { src: string; className: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;

    async function render() {
      setStatus("loading");
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const doc = await pdfjs.getDocument(src).promise;
        if (cancelled || !container) return;

        container.innerHTML = "";
        for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
          const page = await doc.getPage(pageNum);
          if (cancelled) return;
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          canvas.className = "mx-auto mb-3 max-w-full shadow-sm";
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          container.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
        if (!cancelled) setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [src]);

  if (status === "error") {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 bg-zinc-50 px-6 py-12 text-center ${className}`}>
        <p className="text-sm text-zinc-500">Couldn&apos;t render this PDF.</p>
        <a
          href={src}
          className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Download instead
        </a>
      </div>
    );
  }

  return (
    <div className={`overflow-auto bg-zinc-100 p-3 ${className}`}>
      {status === "loading" && <p className="py-8 text-center text-sm text-zinc-400">Loading preview…</p>}
      <div ref={containerRef} />
    </div>
  );
}
