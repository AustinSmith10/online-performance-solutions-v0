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
  | { status: "loading"; pct: number | null }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; filename: string };

/**
 * "Preview" trigger + modal for any project file (submission doc, evidence,
 * PBDB, PBDR). Opens an SSE stream (preview-stream route) on click: the editable
 * PBDB .docx is converted to PDF server-side and its conversion boundaries
 * arrive as `step` events that drive a real progress bar; every other file type
 * resolves to a signed URL in one `ready` event. The document then renders in
 * the shared DocumentViewer, which itself falls back to a download link for
 * formats it can't show inline (TIFF, .eml).
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
  // Guards against a stale stream (reopened before the previous one closed)
  // writing state after a newer run has started.
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

  async function openPreview() {
    const runId = ++runIdRef.current;
    setOpen(true);
    setState({ status: "loading", pct: null });

    await streamFilePreview(projectId, fileId, (event) => {
      if (runIdRef.current !== runId) return;
      if (event.type === "step") {
        setState({ status: "loading", pct: event.pct });
      } else if (event.type === "ready") {
        setState({ status: "ready", url: event.url, filename: event.filename });
      } else {
        setState({ status: "error", message: event.message });
      }
    });

    // Stream closed without a terminal event — treat as a failure rather than
    // spinning forever.
    if (runIdRef.current === runId) {
      setState((s) => (s.status === "loading" ? { status: "error", message: "Preview failed." } : s));
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
                  <div className="px-6 py-12 text-center">
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
                    <p className="mt-3 text-sm text-zinc-500">Rendering preview…</p>
                    {state.pct !== null && (
                      <div className="mx-auto mt-3 w-48">
                        <ProgressTrack pct={state.pct} tone="zinc" />
                        <p className="mt-1 text-xs text-zinc-400">{state.pct}%</p>
                      </div>
                    )}
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
