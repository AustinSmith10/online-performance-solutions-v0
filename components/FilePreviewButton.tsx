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

// When real `step` events are driving the bar, ease between them so a
// 40 -> 70 milestone glides rather than snaps. No synthetic/auto progress:
// with no steps (cached PBDB PDF, plain PDF/image) the UI stays an
// indeterminate spinner until `ready`, so the number never lies.
const TICK_MS = 60;
const EASE = 0.2;

/**
 * "Preview" trigger + modal for any project file (submission doc, evidence,
 * PBDB, PBDR). Opens an SSE stream (preview-stream route) on click. The
 * editable PBDB .docx is converted to PDF server-side and its four conversion
 * boundaries arrive as `step` events that drive a real percentage bar; every
 * other file type just resolves to a signed URL (one `ready` event) and shows
 * a plain spinner. The document then renders in the shared DocumentViewer,
 * which falls back to a download link for formats it can't show inline
 * (TIFF, .eml).
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
  // null until the first real `step` event — that's what switches the UI from
  // spinner to percentage bar.
  const [pct, setPct] = useState<number | null>(null);
  const targetRef = useRef<number | null>(null);
  // Guards a stale stream (reopened before the previous closed) from writing
  // state after a newer run has started.
  const runIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Abort the in-flight SSE stream when the modal closes or the row unmounts,
  // rather than leaving a (possibly minute-long) fetch open to reject later.
  useEffect(() => {
    if (open) return;
    abortRef.current?.abort();
    abortRef.current = null;
  }, [open]);
  useEffect(() => () => abortRef.current?.abort(), []);

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

  // Ease the bar toward the latest real milestone while resolving.
  useEffect(() => {
    if (state.status !== "loading") return;
    const iv = setInterval(() => {
      const t = targetRef.current;
      if (t === null) return;
      setPct((p) => {
        const cur = p ?? 0;
        const next = cur + (t - cur) * EASE;
        return Math.abs(t - next) < 0.4 ? t : next;
      });
    }, TICK_MS);
    return () => clearInterval(iv);
  }, [state.status]);

  async function openPreview() {
    const runId = ++runIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    targetRef.current = null;
    setPct(null);
    setOpen(true);
    setState({ status: "loading" });

    let settled = false;
    await streamFilePreview(projectId, fileId, (event) => {
      if (runIdRef.current !== runId || controller.signal.aborted) return;
      if (event.type === "step") {
        targetRef.current = Math.max(targetRef.current ?? 0, event.pct);
        setPct((p) => p ?? Math.min(event.pct, 12)); // seed the bar so it eases in from low
      } else if (event.type === "ready") {
        settled = true;
        setState({ status: "ready", url: event.url, filename: event.filename });
      } else {
        settled = true;
        setState({ status: "error", message: event.message });
      }
    }, controller.signal);

    // Stream closed with no terminal event — don't spin forever (but a
    // deliberate abort is not a failure).
    if (runIdRef.current === runId && !settled && !controller.signal.aborted) {
      setState({ status: "error", message: "Preview failed." });
    }
  }

  const shownPct = pct === null ? null : Math.min(100, Math.round(pct));

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
                    {shownPct === null ? (
                      <svg
                        className="mx-auto h-5 w-5 animate-spin text-zinc-400"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.25" />
                        <path
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.568 3 7.291l3-3.291z"
                        />
                      </svg>
                    ) : (
                      <div className="mx-auto w-56">
                        <ProgressTrack pct={shownPct} tone="zinc" />
                        <p className="mt-1.5 text-xs tabular-nums text-zinc-400">{shownPct}%</p>
                      </div>
                    )}
                    <p className="mt-4 text-sm text-zinc-500">Rendering preview…</p>
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
