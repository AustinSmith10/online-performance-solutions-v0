"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DocumentViewer, isPreviewable } from "@/components/DocumentViewer";

interface DocumentPreviewModalProps {
  /** Signed URL for the document. If falsy, no trigger is rendered. */
  href?: string | null;
  filename?: string | null;
  buttonLabel?: string;
  buttonClassName?: string;
}

const DEFAULT_BUTTON_CLASS =
  "shrink-0 rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50";

/** Reusable "Preview" trigger + modal, backed by the shared DocumentViewer. */
export function DocumentPreviewModal({
  href,
  filename,
  buttonLabel = "Preview",
  buttonClassName = DEFAULT_BUTTON_CLASS,
}: DocumentPreviewModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    // Lock body scroll while the modal is up.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!href || !isPreviewable(filename, href)) return null;

  // Rendered through a portal to <body> (#177): rendered inline, an ancestor
  // stacking context on the admin project page trapped the overlay behind the
  // upload drop-zone. The backdrop is opaque and z-index sits above every
  // other layer in the app (max in use is z-[60]).
  const overlay = open && typeof document !== "undefined" ? (
    createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-900/80 p-4"
        onClick={() => setOpen(false)}
      >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-zinc-900">{filename ?? "Document preview"}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                Close
              </button>
            </div>
            <div className="overflow-auto">
              <DocumentViewer src={href} filename={filename} />
            </div>
          </div>
      </div>,
      document.body
    )
  ) : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      {overlay}
    </>
  );
}
