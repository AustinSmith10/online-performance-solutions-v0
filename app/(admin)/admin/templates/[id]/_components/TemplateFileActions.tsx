"use client";

import { useState } from "react";
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
    setOpen(true);
    setState({ status: "loading" });
    const result: TemplateFileResult = await getTemplatePreviewUrl(templateId);
    if ("error" in result) {
      setState({ status: "error", message: result.error });
      return;
    }
    setState({ status: "ready", url: result.url, filename: result.filename });
  }

  const btn =
    "rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50";

  return (
    <>
      <button type="button" onClick={openPreview} className={btn}>
        Preview
      </button>
      <button type="button" onClick={download} disabled={downloading} className={btn}>
        {downloading ? "Preparing…" : "Download"}
      </button>
      {downloadError && (
        <span className="text-xs text-red-600">{downloadError}</span>
      )}

      {open && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center bg-black/50 p-4"
            onClick={() => setOpen(false)}
          >
            <div
              className="flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {state.status === "ready" ? state.filename : "Template preview"}
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
