"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPbdbDownloaded } from "@/app/actions/projects";

// Download button for the "Right now" Focus card's just-generated PBDB step.
//
// The download itself is a real <a href> straight to the proven
// /api/download/pbdb/[fileId] route (same one the left-rail versions card and
// admin banner already use) — the browser's own click handles the navigation
// natively. Do NOT swap this for a programmatic a.click() built from a signed
// URL fetched via server action: constructing + clicking an <a> *after*
// awaiting an async call happens outside the original user-gesture context by
// the time it fires, and some browsers silently drop that synthetic
// navigation (confirmed: the file stopped downloading). A real anchor click
// is the user gesture — it can't be dropped.
//
// The markPbdbDownloaded action runs alongside (not gating) the download, to
// set pbdb_downloaded_at + revalidatePath deterministically — the Focus card
// advances to "Upload QA'd PBDB" without depending on RealtimeRefresh to
// notice the row change.
export function GeneratedPbdbDownload({
  projectId,
  fileId,
  filename,
  version,
  generatedDate,
}: {
  projectId: string;
  fileId: string;
  filename: string;
  version: number;
  generatedDate: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await markPbdbDownloaded(projectId, fileId);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-green-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900" title={filename}>
          {filename}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          v{version} · {new Date(generatedDate).toLocaleDateString("en-AU")}
        </p>
      </div>
      <a
        href={`/api/download/pbdb/${fileId}`}
        onClick={handleClick}
        className="shrink-0 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-800 hover:bg-green-100"
      >
        Download
      </a>
    </div>
  );
}
