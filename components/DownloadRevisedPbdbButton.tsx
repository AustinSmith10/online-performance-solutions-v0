"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markWorkingPbdbDownloaded } from "@/app/actions/projects";

// Same real-<a>-click reasoning as GeneratedPbdbDownload.tsx: the download
// itself is a plain <a href> to /api/download/pbdb/[fileId] (the #194 route,
// which patches the revision table/cover in at serve time once the round
// has closed rejected) — a programmatic click built after an awaited call
// falls outside the original user gesture and some browsers silently drop
// it.
const REFRESH_DELAY_MS = 1200;

/**
 * "Download the new working PBDB" Focus-card step (#195) — mirrors
 * GeneratedPbdbDownload's presentation for the analogous "Download the
 * generated PBDB" step, but for the revision-populated copy once a round
 * closes rejected. markWorkingPbdbDownloaded sets revision_history's
 * working_pbdb_downloaded_at for the current revision alongside (not
 * gating) the download, so the Focus card advances to the existing
 * "Upload revised PBDB" step deterministically rather than depending on
 * RealtimeRefresh to notice the row change.
 */
export function DownloadRevisedPbdbButton({
  projectId,
  fileId,
  filename,
}: {
  projectId: string;
  fileId: string;
  filename: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [downloaded, setDownloaded] = useState(false);

  function handleClick() {
    setDownloaded(true);
    startTransition(async () => {
      await markWorkingPbdbDownloaded(projectId);
      await new Promise((resolve) => setTimeout(resolve, REFRESH_DELAY_MS));
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-green-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900" title={filename}>
          {filename}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">Updated with the new revision — download the working copy.</p>
      </div>
      {downloaded ? (
        <span className="shrink-0 rounded-full bg-green-600 px-2.5 py-1 text-xs font-semibold text-white">
          Downloaded ✓
        </span>
      ) : (
        <a
          href={`/api/download/pbdb/${fileId}`}
          download={filename}
          onClick={handleClick}
          className="shrink-0 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
        >
          Download
        </a>
      )}
    </div>
  );
}
