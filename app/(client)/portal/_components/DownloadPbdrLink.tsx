"use client";

export function DownloadPbdrLink({ projectId }: { projectId: string }) {
  return (
    <a
      href={`/api/download/pbdr/${projectId}`}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
    >
      Download PBDR
    </a>
  );
}
