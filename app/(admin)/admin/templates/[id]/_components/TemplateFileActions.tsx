"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  getTemplateDownloadUrl,
  getTemplatePreviewUrl,
  type TemplateFileResult,
} from "@/app/actions/templates";
import { DocumentViewer } from "@/components/DocumentViewer";

/**
 * Header actions for the template detail page: download the working .docx, or
 * preview it rendered to PDF in a modal (via getTemplatePreviewUrl, which runs
 * the same docx→PDF conversion the PBDR preview uses). Both mint a fresh signed
 * URL per click since the `templates` bucket is private.
 */
export function TemplateFileActions({ templateId }: { templateId: string }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; url: string; filename: string }
  >({ status: "idle" });

  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // Bumped on every open and close: a preview response for an older request
  // must not overwrite the state of a newer one (or of a closed dialog).
  const requestRef = useRef(0);
  const close = () => {
    requestRef.current += 1;
    setOpen(false);
  };

  // Escape closes; Tab is trapped inside the dialog while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { requestRef.current += 1; setOpen(false); return; }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus moves into the dialog on open and back to the opener on close.
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement as HTMLElement | null;
      panelRef.current?.focus();
    } else {
      openerRef.current?.focus();
      openerRef.current = null;
    }
  }, [open]);

  async function download() {
    setDownloading(true);
    setDownloadError(null);
    const result: TemplateFileResult = await getTemplateDownloadUrl(templateId);
    setDownloading(false);
    if ("error" in result) {
      setDownloadError(result.error);
      return;
    }
    window.location.href = result.url;
  }

  async function openPreview() {
    const request = ++requestRef.current;
    setOpen(true);
    setState({ status: "loading" });
    const result: TemplateFileResult = await getTemplatePreviewUrl(templateId);
    if (request !== requestRef.current) return;
    if ("error" in result) {
      setState({ status: "error", message: result.error });
      return;
    }
    setState({ status: "ready", url: result.url, filename: result.filename });
  }

  const btn =
    "press-subtle rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

  return (
    <>
      <button type="button" onClick={openPreview} className={btn}>
        Preview
      </button>
      <button type="button" onClick={download} disabled={downloading} className={btn}>
        {downloading ? "Preparing…" : "Download"}
      </button>
      {downloadError && (
        <span className="rise-in text-xs text-red-600">{downloadError}</span>
      )}

      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            className="modal-backdrop fixed inset-0 z-[100] flex flex-col items-center bg-black/50 p-4"
            onClick={close}
          >
            <div
              ref={panelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-label="Template preview"
              className="modal-panel flex min-h-0 w-full max-w-3xl outline-none flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {state.status === "ready" ? state.filename : "Template preview"}
                </p>
                <button
                  type="button"
                  onClick={close}
                  className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-500 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 [@media(pointer:coarse)]:min-h-10"
                >
                  Close
                </button>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-auto">
                {state.status === "loading" && (
                  <p className="px-6 py-12 text-center text-sm text-zinc-500">
                    Rendering preview…
                  </p>
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
