"use client";

import { DownloadCard } from "@/components/DownloadCard";

export function DownloadPbdrLink({
  projectId,
  filename,
}: {
  projectId: string;
  filename?: string;
}) {
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <DownloadCard
        href={`/api/download/pbdr/${projectId}`}
        filename={filename}
        originalFilename={filename}
        buttonLabel="Download PBDR"
        buttonClassName="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
        wrapperClassName="inline-flex items-center gap-2"
        filenameClassName="max-w-[130px]"
      />
    </div>
  );
}
