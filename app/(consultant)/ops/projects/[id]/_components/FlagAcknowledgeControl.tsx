"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acknowledgeFieldFlag } from "@/app/actions/field-flags";
import { DocumentViewer, isPreviewable } from "@/components/DocumentViewer";

interface Props {
  flagId: string;
  sourceUrl?: string | null;
  sourceFilename?: string | null;
}

/**
 * The consultant's per-flag acknowledgment (#105): opens the flagged
 * field's source document in the shared viewer, then confirms review from
 * inside that same modal — acknowledging is deliberately not a bare button
 * click elsewhere on the page.
 */
export function FlagAcknowledgeControl({ flagId, sourceUrl, sourceFilename }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleAcknowledge() {
    setPending(true);
    setError(null);
    const result = await acknowledgeFieldFlag(flagId);
    setPending(false);
    if (result.ok) {
      setDone(true);
      setOpen(false);
      router.refresh();
      return;
    }
    setError(result.error);
  }

  if (done) {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
        Acknowledged
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Review &amp; acknowledge
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
                {sourceFilename ?? "Source document"}
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
              {sourceUrl && isPreviewable(sourceFilename, sourceUrl) ? (
                <DocumentViewer src={sourceUrl} filename={sourceFilename} />
              ) : (
                <p className="px-6 py-12 text-center text-sm text-zinc-500">
                  No previewable source document found for this candidate.
                </p>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3">
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                  className="rounded-md px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-700 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAcknowledge}
                  disabled={pending}
                  className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
                >
                  {pending ? "Acknowledging…" : "Acknowledge"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
