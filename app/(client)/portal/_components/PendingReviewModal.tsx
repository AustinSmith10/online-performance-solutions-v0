"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PortalApprovalForm } from "@/app/(client)/portal/projects/[id]/_components/PortalApprovalForm";

interface Props {
  projectLabel: string;
  reviewId: string;
  projectId: string;
  pbdbDownloadUrl: string;
  pbdbFilename?: string;
  expiresAt: string;
}

export function PendingReviewModal({
  projectLabel,
  reviewId,
  projectId,
  pbdbDownloadUrl,
  pbdbFilename,
  expiresAt,
}: Props) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-amber-700"
      >
        Review
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          aria-hidden="true"
        >
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/30"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="mx-4 w-full max-w-lg rounded-xl border border-zinc-200 bg-white shadow-xl">
            <div className="flex items-start justify-between border-b border-zinc-100 px-6 py-4">
              <div className="min-w-0 pr-4">
                <h2 className="text-base font-semibold text-zinc-900">PBDB Review</h2>
                <p className="mt-0.5 truncate text-xs text-zinc-500">{projectLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                aria-label="Close"
              >
                <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <PortalApprovalForm
                reviewId={reviewId}
                projectId={projectId}
                pbdbDownloadUrl={pbdbDownloadUrl}
                pbdbFilename={pbdbFilename}
                expiresAt={expiresAt}
                bare
                onSubmitted={() => {
                  setOpen(false);
                  router.refresh();
                }}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
