"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PreviewKind = "pdf" | "image" | "unsupported";

type PdfjsModule = typeof import("pdfjs-dist");
type PdfDoc = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;

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
 * as plain images. Both are zoomable (toolbar + / − / Fit width / 100%, or
 * the +/-/0 keys) and scroll natively so a reader can actually read a
 * shrunk-to-fit A3 drawing. Anything else (TIFF, docx, unknown) gets a
 * "preview not available" fallback with a download link.
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

// PDF pages rasterize at 1.6× natural size so text stays sharp when the
// reader zooms in, without the cost that 2× incurs. Display size is CSS.
const RENDER_SCALE = 1.6;

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
  const [zoom, setZoom] = useState(1);

  return (
    <div className={`flex h-[78vh] flex-col ${className}`}>
      <ZoomBar zoom={zoom} onZoom={setZoom} onFit={() => setZoom(1)} />
      <div className="flex-1 overflow-auto bg-zinc-100">
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

interface PageDim {
  num: number;
  /** Page width/height in CSS px at 100% zoom (PDF user units == CSS px). */
  w: number;
  h: number;
}

/**
 * One page. Renders a real <canvas> (React-owned, so a parent re-render for
 * zoom doesn't wipe it) into a box whose size is reserved up front via
 * aspect-ratio — so the scrollbar is correct from the first paint and pages
 * filling in below never shift what you're reading. Rasterization only runs
 * once `shouldRender` flips true, which the parent gates one page at a time.
 */
function PdfPage({
  num,
  doc,
  widthPx,
  aspect,
  shouldRender,
  onSettled,
}: {
  num: number;
  doc: PdfDoc;
  widthPx: number;
  aspect: string;
  shouldRender: boolean;
  onSettled: (num: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!shouldRender || doneRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let task: { promise: Promise<void>; cancel: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const page = await doc.getPage(num);
        if (cancelled) return;
        const vp = page.getViewport({ scale: RENDER_SCALE });
        canvas.width = vp.width;
        canvas.height = vp.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        task = page.render({ canvasContext: ctx, viewport: vp });
        await task.promise;
      } catch {
        /* cancelled or failed — leave the reserved blank box */
      } finally {
        if (!cancelled) {
          doneRef.current = true;
          onSettled(num);
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        task?.cancel();
      } catch {
        /* already settled */
      }
    };
  }, [shouldRender, doc, num, onSettled]);

  return (
    <div
      data-page={num}
      style={{ width: widthPx > 0 ? `${widthPx}px` : undefined, aspectRatio: aspect }}
      className="mx-auto mb-3 bg-white shadow-sm"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

function PdfCanvasViewer({ src, className }: { src: string; className: string }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [pages, setPages] = useState<PageDim[]>([]);
  // null until the first fit calculation; then an explicit multiplier.
  const [zoom, setZoom] = useState<number | null>(null);
  // Once the reader zooms by hand, stop auto-fitting on resize.
  const userZoomed = useRef(false);

  // Lazy-render machinery. `allowed` only ever grows — a page, once cleared to
  // rasterize, keeps its bitmap. `inView`/`done` are refs (no re-render needed)
  // and `pumping` guards so exactly one page rasterizes at a time — that's what
  // keeps the main thread free enough to scroll a 24-page document.
  const [allowed, setAllowed] = useState<Set<number>>(() => new Set());
  const inView = useRef<Set<number>>(new Set());
  const done = useRef<Set<number>>(new Set());
  const pumping = useRef(false);

  const pageCssWidth = pages[0]?.w ?? 0;

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

  // Advance the one-at-a-time rasterize queue: the lowest-numbered in-view page
  // that hasn't rendered yet. One page at a time is what keeps the main thread
  // free enough to scroll a 24-page document.
  const pump = useCallback(() => {
    if (pumping.current) return;
    let next: number | null = null;
    for (const n of inView.current) {
      if (!done.current.has(n) && (next === null || n < next)) next = n;
    }
    if (next === null) return;
    pumping.current = true;
    const target = next;
    setAllowed((prev) => (prev.has(target) ? prev : new Set(prev).add(target)));
  }, []);

  const handleSettled = useCallback(
    (num: number) => {
      done.current.add(num);
      pumping.current = false;
      // Hand the main thread back for a beat before the next page so a burst
      // of queued scroll/wheel events gets processed.
      setTimeout(pump, 16);
    },
    [pump]
  );

  // Which page boxes sit within ~2 screens of the current scroll position.
  // Driven by scroll events (which always fire) + an initial call — no
  // IntersectionObserver, whose callbacks are suspended for background tabs.
  const evaluateVisible = useCallback(() => {
    const root = scrollRef.current;
    if (!root) return;
    const buffer = root.clientHeight * 2;
    const rootTop = root.getBoundingClientRect().top;
    let changed = false;
    root.querySelectorAll<HTMLElement>("[data-page]").forEach((box) => {
      const r = box.getBoundingClientRect();
      const relTop = r.top - rootTop;
      const relBottom = r.bottom - rootTop;
      const near = relBottom >= -buffer && relTop <= root.clientHeight + buffer;
      const n = Number(box.dataset.page);
      if (near) {
        if (!inView.current.has(n)) {
          inView.current.add(n);
          changed = true;
        }
      } else {
        inView.current.delete(n);
      }
    });
    if (changed) pump();
  }, [pump]);

  // ── Load the document + every page's natural size ──────────────────────
  useEffect(() => {
    let cancelled = false;
    let loadingTask: { promise: Promise<PdfDoc>; destroy: () => Promise<void> } | null = null;

    async function load() {
      setStatus("loading");
      setDoc(null);
      setPages([]);
      setAllowed(new Set());
      setZoom(null);
      inView.current = new Set();
      done.current = new Set();
      pumping.current = false;
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        loadingTask = pdfjs.getDocument(src);
        const d = await loadingTask.promise;
        if (cancelled) return;

        // Size every placeholder from page 1 — cheap, and these documents
        // (PBDB / PBDR / drawing sets) are page-uniform in practice.
        const first = await d.getPage(1);
        if (cancelled) return;
        const vp = first.getViewport({ scale: 1 });
        const dims: PageDim[] = Array.from({ length: d.numPages }, (_, i) => ({
          num: i + 1,
          w: vp.width,
          h: vp.height,
        }));
        setDoc(d);
        setPages(dims);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    }

    void load();

    return () => {
      cancelled = true;
      loadingTask?.destroy().catch(() => {});
    };
  }, [src]);

  // ── Render pages near the scroll position; re-evaluate as the user scrolls ──
  useEffect(() => {
    if (status !== "ready" || pages.length === 0) return;
    const root = scrollRef.current;
    if (!root) return;
    const onScroll = () => evaluateVisible();
    root.addEventListener("scroll", onScroll, { passive: true });
    evaluateVisible();
    return () => root.removeEventListener("scroll", onScroll);
  }, [status, pages, evaluateVisible]);

  // ── Fit-to-width on first layout and on resize ──────────────────────
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
    if (zoom === null && pageCssWidth > 0) fit();
  }, [zoom, pageCssWidth, fit]);

  // Re-check which pages are near the viewport after a zoom (box heights change).
  useEffect(() => {
    if (status === "ready") evaluateVisible();
  }, [zoom, status, evaluateVisible]);

  // ── Keyboard zoom while the scroll area has focus ───────────────────
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

  const dz = zoom ?? 1;
  const note = pages.length > 1 ? `${pages.length} pages` : undefined;

  return (
    <div className={`flex h-[78vh] flex-col ${className}`}>
      <ZoomBar zoom={dz} onZoom={zoomTo} onFit={fit} note={note} />
      <div
        ref={scrollRef}
        tabIndex={0}
        className="flex-1 overflow-auto bg-zinc-100 p-3 outline-none"
      >
        {status === "loading" && (
          <p className="py-10 text-center text-sm text-zinc-400">Loading preview…</p>
        )}
        {doc &&
          pages.map((p) => (
            <PdfPage
              key={p.num}
              num={p.num}
              doc={doc}
              widthPx={Math.round(p.w * dz)}
              aspect={`${p.w} / ${p.h}`}
              shouldRender={allowed.has(p.num)}
              onSettled={handleSettled}
            />
          ))}
      </div>
    </div>
  );
}
