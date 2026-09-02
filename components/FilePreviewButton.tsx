"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getProjectFilePreviewUrl } from "@/app/actions/file-preview";
import { DocumentViewer } from "@/components/DocumentViewer";

const DEFAULT_BUTTON_CLASS =
  "shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; url: string; filename: string };

/**
 * "Preview" trigger + modal for any project file (submission doc, evidence,
 * PBDB, PBDR). Fetches a signed URL lazily on click via getProjectFilePreviewUrl
 * — which converts the editable PBDB .docx to PDF as needed — then renders it
 * with the shared DocumentViewer. Always renders a button so every row in the
 * Documents tab can be previewed; the viewer itself shows a graceful
 * download-only fallback for formats it can't render inline (TIFF, .eml).
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
    setOpen(true);
    setState({ status: "loading" });
    const result = await getProjectFilePreviewUrl(projectId, fileId);
    if ("error" in result) {
      setState({ status: "error", message: result.error });
      return;
    }
    setState({ status: "ready", url: result.url, filename: result.filename });
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
                  <p className="px-6 py-12 text-center text-sm text-zinc-500">Rendering preview…</p>
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
