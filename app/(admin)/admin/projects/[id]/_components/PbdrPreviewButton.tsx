"use client";

import { useState } from "react";
import { getPbdrPreviewUrl } from "@/app/actions/conversion";
import { DocumentViewer } from "@/components/DocumentViewer";
import { useProjectProgress } from "@/hooks/useProjectProgress";
import { ProgressTrack } from "@/components/ProgressTrack";

/**
 * Sits in the "Ready to convert" focus card next to ConvertButton — lets the
 * admin/consultant see what the PBDR will look like before committing to
 * Convert & deliver. Generated lazily via getPbdrPreviewUrl, which renders
 * the same transform as the real conversion without any of its side effects.
 */
export function PbdrPreviewButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; url: string; filename: string }
  >({ status: "idle" });
  const pct = useProjectProgress(projectId, state.status === "loading");

  async function openPreview() {
    setOpen(true);
    setState({ status: "loading" });
    const result = await getPbdrPreviewUrl(projectId);
    if ("error" in result) {
      setState({ status: "error", message: result.error });
      return;
    }
    setState({ status: "ready", url: result.url, filename: result.filename });
  }

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Preview PBDR
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-zinc-900">
                {state.status === "ready" ? state.filename : "PBDR preview"}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                Close
              </button>
            </div>
            <div className="overflow-auto">
              {state.status === "loading" && (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-zinc-500">Generating preview…</p>
                  {pct !== null && (
                    <div className="mx-auto mt-3 w-48">
                      <ProgressTrack pct={pct} tone="zinc" />
                      <p className="mt-1 text-xs text-zinc-400">{pct}%</p>
                    </div>
                  )}
                </div>
              )}
              {state.status === "error" && (
                <p className="px-6 py-12 text-center text-sm text-red-600">{state.message}</p>
              )}
              {state.status === "ready" && <DocumentViewer src={state.url} filename={state.filename} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
