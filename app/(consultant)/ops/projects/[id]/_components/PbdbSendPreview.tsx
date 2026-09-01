"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { acknowledgePbdbQaFlags, getPbdbPreviewUrl } from "@/app/actions/projects";
import { DocumentViewer } from "@/components/DocumentViewer";

interface Props {
  projectId: string;
  fileId: string;
  findings: string[];
  acknowledged: boolean;
}

/**
 * Sits between "Upload QA'd PBDB" and the Send/Dispatch action (#112): lets
 * the consultant preview exactly what the stakeholder will receive (the
 * converted PDF, generated/reused lazily via getOrCreateDispatchPdf) and,
 * when the upload has structure-scan findings, forces an explicit
 * acknowledgment before Send unlocks. Send itself stays a separate action
 * (DispatchButton) — this component only gates whether that button is shown.
 */
export function PbdbSendPreview({ projectId, fileId, findings, acknowledged }: Props) {
  const router = useRouter();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewState, setPreviewState] = useState<
    { status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "ready"; url: string; filename: string }
  >({ status: "idle" });
  const [checked, setChecked] = useState(false);
  const [ackPending, setAckPending] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);

  async function openPreview() {
    setPreviewOpen(true);
    setPreviewState({ status: "loading" });
    const result = await getPbdbPreviewUrl(projectId);
    if ("error" in result) {
      setPreviewState({ status: "error", message: result.error });
      return;
    }
    setPreviewState({ status: "ready", url: result.url, filename: result.filename });
  }

  // Esc to close + lock body scroll while the preview is up. Matches
  // DocumentPreviewModal so the two previewers behave identically.
  useEffect(() => {
    if (!previewOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPreviewOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [previewOpen]);

  async function handleAcknowledge() {
    setAckPending(true);
    setAckError(null);
    const result = await acknowledgePbdbQaFlags(projectId, fileId);
    setAckPending(false);
    if (result.error) {
      setAckError(result.error);
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={openPreview}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Preview PBDB
      </button>

      {previewOpen && typeof document !== "undefined" &&
        createPortal(
          // Portalled to <body> and sized like DocumentPreviewModal (#177):
          // rendered inline it inherits the drawer's narrow containing block
          // and the document is unreadable. z above every other layer.
          <div
            className="fixed inset-0 z-[100] flex flex-col items-center bg-zinc-900/80 p-4"
            onClick={() => setPreviewOpen(false)}
          >
            <div
              className="flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-lg bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {previewState.status === "ready" ? previewState.filename : "PBDB preview"}
                </p>
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="shrink-0 rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                >
                  Close
                </button>
              </div>
              {previewState.status === "loading" && (
                <p className="px-6 py-12 text-center text-sm text-zinc-500">Generating preview…</p>
              )}
              {previewState.status === "error" && (
                <p className="px-6 py-12 text-center text-sm text-red-600">{previewState.message}</p>
              )}
              {previewState.status === "ready" && (
                <DocumentViewer src={previewState.url} filename={previewState.filename} fill />
              )}
            </div>
          </div>,
          document.body
        )}

      {findings.length > 0 && !acknowledged && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-xs font-semibold text-amber-800">
            {findings.length} issue{findings.length === 1 ? "" : "s"} found — review before sending
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-amber-800">
            {findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
          <label className="mt-3 flex items-start gap-2 text-xs text-amber-900">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              className="mt-0.5"
            />
            I&apos;ve reviewed these and confirm this is the right document to send.
          </label>
          {ackError && <p className="mt-2 text-xs text-red-600">{ackError}</p>}
          <button
            type="button"
            onClick={handleAcknowledge}
            disabled={!checked || ackPending}
            className="mt-2 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {ackPending ? "Acknowledging…" : "Acknowledge & continue"}
          </button>
        </div>
      )}
    </div>
  );
}
