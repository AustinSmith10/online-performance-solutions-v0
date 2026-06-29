"use client";

import { PbdrDownloadButton } from "@/components/PbdrDownloadButton";

export function DownloadPbdrLink({ projectId }: { projectId: string }) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <PbdrDownloadButton
        href={`/api/download/pbdr/${projectId}`}
        label="Download PBDR"
        className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
      />
    </div>
  );
}
