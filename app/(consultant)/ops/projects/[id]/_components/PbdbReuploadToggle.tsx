"use client";

import { useState } from "react";
import { PbdbQaUploadForm } from "./PbdbQaUploadForm";

/**
 * Secondary escape hatch on the "Ready to dispatch" focus card — lets the
 * consultant swap in a different PBDB before it goes out, for when the
 * uploaded QA'd file turns out to be the wrong one. Collapsed by default so
 * it doesn't compete with the primary dispatch action; reveals the same
 * upload form used for QA re-uploads. No confirmation dialog here (unlike
 * the post-dispatch "revision" re-upload) — nothing has been sent to
 * stakeholders yet at this stage, so there's no approval state to warn about
 * resetting.
 */
export function PbdbReuploadToggle({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-500 underline hover:text-zinc-700"
      >
        Wrong file? Upload a different PBDB
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-zinc-200 bg-zinc-50/60 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-zinc-700">Upload a different PBDB</p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          Cancel
        </button>
      </div>
      <PbdbQaUploadForm projectId={projectId} submitLabel="Replace PBDB" />
    </div>
  );
}
