"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;

export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/**
 * The zoom that makes a page of `pageWidth` CSS px fill `containerWidth`
 * (minus a little padding), clamped so a very wide sheet still starts
 * readable and a narrow one doesn't balloon past 100%.
 */
export function computeFitZoom(containerWidth: number, pageWidth: number): number {
  if (pageWidth <= 0 || containerWidth <= 0) return 1;
  return clampZoom(Math.min(1, (containerWidth - 24) / pageWidth));
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
 * as plain images. Both are zoomable and drag-to-pan so a reader can
 * actually read a shrunk-to-fit A3 drawing. Anything else (TIFF, docx,
 * unknown) gets a "preview not available" fallback with a download link.
 */
export function DocumentViewer({ src, filename, className = "" }: DocumentViewerProps) {
  const kind = detectKind(filename, src);

  if (kind === "pdf") {
    return <PdfCanvasViewer src={src} className={className} />;
  }

  if (kind === "image") {
    return <ImageViewer src={src} filename={filename} className={className} />;
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

// PDF pages render at 2× so text on a shrunk-to-fit A3 sheet is still sharp
// when the reader zooms back in. Display size is controlled separately via CSS.
const RENDER_SCALE = 2;

// ── click-and-drag panning on a scroll container ─────────────────────────────
function usePanScroll(ref: React.RefObject<HTMLDivElement | null>) {
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      const el = ref.current;
      if (!el) return;
      drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
      setDragging(true);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* capture is best-effort */
      }
    },
    [ref]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (!el || !drag.current) return;
      el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
      el.scrollTop = drag.current.top - (e.clientY - drag.current.y);
    },
    [ref]
  );

  const end = useCallback(
    (e: React.PointerEvent) => {
      const el = ref.current;
      if (el && drag.current) {
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* already released */
        }
      }
      drag.current = null;
      setDragging(false);
    },
    [ref]
  );

  return {
    dragging,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: end,
      onPointerCancel: end,
    },
  };
}

function ZoomBar({
  zoom,
  onZoom,
  onFit,
  note,
}: {
  zoom: number;
  onZoom: (next: number) => void;
  onFit: () => void;
  note?: string;
}) {
  const btn =
    "flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100 disabled:opacity-40";
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-zinc-200 bg-zinc-50/95 px-3 py-1.5 backdrop-blur">
      <button
        type="button"
        className={btn}
        onClick={() => onZoom(clampZoom(zoom - 0.25))}
        aria-label="Zoom out"
        disabled={zoom <= MIN_ZOOM}
      >
        <span className="text-base leading-none">&minus;</span>
      </button>
      <span className="w-12 text-center text-xs tabular-nums text-zinc-600">{Math.round(zoom * 100)}%</span>
      <button
        type="button"
        className={btn}
        onClick={() => onZoom(clampZoom(zoom + 0.25))}
        aria-label="Zoom in"
        disabled={zoom >= MAX_ZOOM}
      >
        <span className="text-base leading-none">+</span>
      </button>
      <span className="mx-1 h-4 w-px bg-zinc-300" />
      <button
        type="button"
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
        onClick={onFit}
      >
        Fit width
      </button>
      <button
        type="button"
        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
        onClick={() => onZoom(1)}
      >
        100%
      </button>
      {note && <span className="ml-auto text-xs text-zinc-400">{note}</span>}
    </div>
  );
}

function ImageViewer({ src, filename, className }: { src: string; filename?: string | null; className: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const { dragging, handlers } = usePanScroll(scrollRef);

  return (
    <div className={`flex min-h-[65vh] flex-col ${className}`}>
      <ZoomBar zoom={zoom} onZoom={setZoom} onFit={() => setZoom(1)} note="drag to pan" />
      <div
        ref={scrollRef}
        className={`flex-1 overflow-auto bg-zinc-100 ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        {...handlers}
      >
        <div className="flex min-h-full min-w-full items-start justify-center p-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary signed-URL source, not a static asset */}
          <img
            src={src}
            alt={filename ?? "Document preview"}
            draggable={false}
            style={{ width: `${zoom * 100}%`, maxWidth: zoom <= 1 ? "100%" : "none" }}
            className="h-auto select-none object-contain shadow-sm"
          />
        </div>
      </div>
    </div>
  );
}

function PdfCanvasViewer({ src, className }: { src: string; className: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [pagesRendered, setPagesRendered] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  // Width of one page in CSS px at 100% (natural size, RENDER_SCALE divided out).
  const [pageCssWidth, setPageCssWidth] = useState(0);
  // null until the first fit calculation; then an explicit multiplier.
  const [zoom, setZoom] = useState<number | null>(null);
  const { dragging, handlers } = usePanScroll(scrollRef);
  // Once the reader zooms by hand, stop auto-fitting on resize — until they
  // press "Fit width" again.
  const userZoomed = useRef(false);

  const fit = useCallback(() => {
    const w = scrollRef.current?.clientWidth ?? 0;
    if (pageCssWidth > 0 && w > 0) {
      userZoomed.current = false;
      setZoom(computeFitZoom(w, pageCssWidth));
    }
  }, [pageCssWidth]);

  const zoomTo = useCallback((next: number | ((current: number) => number)) => {
    userZoomed.current = true;
    setZoom((z) => clampZoom(typeof next === "function" ? next(z ?? 1) : next));
  }, []);

  // Re-fit whenever the pane resizes (or first gets a real width) as long as
  // the reader hasn't taken manual control. A ResizeObserver fires once on
  // observe with the settled layout size, which is what fixes the "fit ran
  // before the modal was laid out → clamped to 25%" case.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (!userZoomed.current) fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;

    async function render() {
      setStatus("loading");
      setPagesRendered(0);
      setTotalPages(0);
      setPageCssWidth(0);
      setZoom(null);
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
          const viewport = page.getViewport({ scale: RENDER_SCALE });
          if (pageNum === 1) setPageCssWidth(viewport.width / RENDER_SCALE);
          const canvas = document.createElement("canvas");
          canvas.className = "mx-auto mb-3 block max-w-none shadow-sm";
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.dataset.baseWidth = String(viewport.width / RENDER_SCALE);
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

  // First fit once we know the page width and the container is laid out.
  useEffect(() => {
    if (zoom === null && pageCssWidth > 0) fit();
  }, [zoom, pageCssWidth, fit]);

  // Apply the current zoom to every rendered canvas — pure CSS width, instant,
  // no re-render of the PDF.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container || zoom === null) return;
    container.querySelectorAll<HTMLCanvasElement>("canvas").forEach((canvas) => {
      const base = Number(canvas.dataset.baseWidth) || 0;
      canvas.style.width = base > 0 ? `${Math.round(base * zoom)}px` : "";
    });
  }, [zoom, pagesRendered]);

  // Keyboard zoom while the scroll area has focus.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "+" || e.key === "=") zoomTo((z) => z + 0.25);
      else if (e.key === "-" || e.key === "_") zoomTo((z) => z - 0.25);
      else if (e.key === "0") zoomTo(1);
      else return;
      e.preventDefault();
    }
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [zoomTo]);

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
    <div className={`flex min-h-[65vh] flex-col ${className}`}>
      <ZoomBar
        zoom={zoom ?? 1}
        onZoom={zoomTo}
        onFit={fit}
        note={totalPages > 1 ? `${totalPages} pages · drag to pan` : "drag to pan"}
      />
      <div
        ref={scrollRef}
        tabIndex={0}
        className={`flex-1 overflow-auto bg-zinc-100 p-3 outline-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        {...handlers}
      >
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
        <div ref={containerRef} className="min-w-min" />
      </div>
    </div>
  );
}
