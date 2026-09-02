"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DocumentViewer } from "@/components/DocumentViewer";
import { ProgressTrack } from "@/components/ProgressTrack";
import { streamFilePreview } from "@/components/streamFilePreview";

const DEFAULT_BUTTON_CLASS =
  "shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; filename: string };

// The bar eases toward `target` every tick; while nothing new has arrived it
// also lets `target` creep on its own toward CREEP_CEILING so a slow
// conversion never looks frozen. A real `step` event snaps `target` up past
// the ceiling; `ready` takes it to 100.
const TICK_MS = 90;
const EASE = 0.16;
const CREEP = 0.035;
const CREEP_CEILING = 90;
const START_PCT = 6;

/**
 * "Preview" trigger + modal for any project file (submission doc, evidence,
 * PBDB, PBDR). Opens an SSE stream (preview-stream route) on click: the editable
 * PBDB .docx is converted to PDF server-side and its conversion boundaries
 * arrive as `step` events; every other file type resolves to a signed URL in
 * one `ready` event. A trickling progress bar bridges the gaps so even the
 * fast paths read as motion rather than a 10→100 jump. The document then
 * renders in the shared DocumentViewer (which falls back to a download link
 * for formats it can't show inline, e.g. TIFF / .eml).
 */
export function FilePreviewButton({
  projectId,
  fileId,
  buttonLabel = "Preview",
  buttonClassName = DEFAULT_BUTTON_CLASS,
}: {
  projectId: string;
  fileId: string;
  buttonLabel?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const [pct, setPct] = useState(START_PCT);
  // Where the bar is easing toward. A ref so the stream callback and the
  // animation tick share it without re-subscribing effects.
  const targetRef = useRef(START_PCT);
  // Guards a stale stream (reopened before the previous closed) from writing
  // state after a newer run has started.
  const runIdRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Ease + auto-creep the bar while the preview is resolving.
  useEffect(() => {
    if (state.status !== "loading") return;
    const iv = setInterval(() => {
      if (targetRef.current < CREEP_CEILING) {
        targetRef.current = Math.min(
          CREEP_CEILING,
          targetRef.current + (CREEP_CEILING - targetRef.current) * CREEP
        );
      }
      setPct((p) => {
        const t = targetRef.current;
        const next = p + (t - p) * EASE;
        return Math.abs(t - next) < 0.4 ? t : next;
      });
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [state.status]);

  async function openPreview() {
    const runId = ++runIdRef.current;
    targetRef.current = START_PCT;
    setPct(START_PCT);
    setOpen(true);
    setState({ status: "loading" });

    let settled = false;
    await streamFilePreview(projectId, fileId, (event) => {
      if (runIdRef.current !== runId) return;
      if (event.type === "step") {
        targetRef.current = Math.max(targetRef.current, event.pct);
      } else if (event.type === "ready") {
        settled = true;
        targetRef.current = 100;
        setPct(100);
        setState({ status: "ready", url: event.url, filename: event.filename });
      } else {
        settled = true;
        setState({ status: "error", message: event.message });
      }
    });

    // Stream closed with no terminal event — don't spin forever.
    if (runIdRef.current === runId && !settled) {
      setState({ status: "error", message: "Preview failed." });
    }
  }

  return (
    <>
      <button type="button" onClick={openPreview} className={buttonClassName}>
        {buttonLabel}
      </button>

      {open && typeof document !== "undefined" &&
        createPortal(
          // Portalled to <body> and sized off the box model (not a vh/dvh
          // height), matching DocumentPreviewModal (#177) so an ancestor
          // stacking context / transform can't trap or offset the overlay.
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center bg-zinc-900/80 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {state.status === "ready" ? state.filename : "Document preview"}
                </p>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                >
                  Close
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                {state.status === "loading" && (
                  <div className="px-6 py-16 text-center">
                    <p className="text-sm text-zinc-500">Rendering preview…</p>
                    <div className="mx-auto mt-4 w-56">
                      <ProgressTrack pct={Math.min(100, Math.round(pct))} tone="zinc" />
                      <p className="mt-1.5 text-xs tabular-nums text-zinc-400">
                        {Math.min(100, Math.round(pct))}%
                      </p>
                    </div>
                  </div>
                )}
                {state.status === "error" && (
                  <p className="px-6 py-12 text-center text-sm text-red-600">{state.message}</p>
                )}
                {state.status === "ready" && (
                  <DocumentViewer src={state.url} filename={state.filename} fill />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
