"use client";

import { useEffect, useRef, useState } from "react";
import { ProgressTrack } from "@/components/ProgressTrack";

type PreviewKind = "pdf" | "image" | "unsupported";

function extKind(name: string): PreviewKind | null {
  const ext = name.split("?")[0].split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "pdf";
  if (ext === "png" || ext === "jpg" || ext === "jpeg") return "image";
  return null;
}

function detectKind(filename?: string | null, src?: string | null): PreviewKind {
  // Prefer whichever of the two actually carries a recognizable extension.
  // `src` is checked first since `filename` is sometimes a display label
  // (e.g. a file-requirement name) rather than a real filename — but `src`
  // is sometimes an extensionless blob: URL for a not-yet-uploaded local
  // file, in which case the real filename is the only one worth trusting.
  return extKind(src ?? "") ?? extKind(filename ?? "") ?? "unsupported";
}

/** Whether DocumentViewer can render this file inline (vs. a download-only fallback). */
export function isPreviewable(filename?: string | null, src?: string | null): boolean {
  return detectKind(filename, src) !== "unsupported";
}

/** Rounded render-progress percentage — 0 while the page count isn't known yet. */
export function computeRenderProgress(pagesRendered: number, totalPages: number): number {
  if (totalPages <= 0) return 0;
  return Math.round((pagesRendered / totalPages) * 100);
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
  // Real progress computed directly from the render loop itself —
  // pagesRendered/totalPages, once PDF.js's getDocument() resolves with a
  // known page count. No per-page thumbnail tiles: a 29+ page document would
  // blow out the layout, so this is just the running count + a % bar,
  // scaling the same regardless of document length.
  const [pagesRendered, setPagesRendered] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;

    async function render() {
      setStatus("loading");
      setPagesRendered(0);
      setTotalPages(0);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        const doc = await pdfjs.getDocument(src).promise;
        if (cancelled || !container) return;
        setTotalPages(doc.numPages);

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
          if (cancelled) return;
          setPagesRendered(pageNum);
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

  const pct = computeRenderProgress(pagesRendered, totalPages);

  return (
    <div className={`overflow-auto bg-zinc-100 p-3 ${className}`}>
      {status === "loading" && (
        <div className="px-3 py-8">
          {totalPages > 0 ? (
            <div className="mx-auto max-w-xs">
              <div className="mb-1 flex justify-between text-xs text-zinc-500">
                <span>{`Rendering page ${pagesRendered} of ${totalPages}`}</span>
                <span>{pct}%</span>
              </div>
              <ProgressTrack pct={pct} />
            </div>
          ) : (
            <p className="text-center text-sm text-zinc-400">Loading preview…</p>
          )}
        </div>
      )}
      <div ref={containerRef} />
    </div>
  );
}
