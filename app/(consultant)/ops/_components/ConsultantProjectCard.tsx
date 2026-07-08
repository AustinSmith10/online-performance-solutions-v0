"use client";

import { useRouter } from "next/navigation";
import { RevisionReviewDrawer, type RevisionProject, type ReviewRow, type PbdbFile } from "./RevisionReviewDrawer";

interface RevisionReview {
  project: RevisionProject;
  reviews: ReviewRow[];
  pbdbFile: PbdbFile | null;
}

interface Props {
  href: string;
  label: string;
  clientName: string | null;
  submitterName: string | null;
  statusLabel: string;
  statusClassName: string;
  expectedDeliveryLabel: string | null;
  isOverdue: boolean;
  revisionReview?: RevisionReview;
}

export function ConsultantProjectCard({
  href,
  label,
  clientName,
  submitterName,
  statusLabel,
  statusClassName,
  expectedDeliveryLabel,
  isOverdue,
  revisionReview,
}: Props) {
  const router = useRouter();
  const caption = [clientName, submitterName].filter(Boolean).join(" · ") || null;

  return (
    <div
      className={`cursor-pointer rounded-lg border px-4 py-3 ${
        revisionReview ? "border-red-300 bg-red-50" : "border-zinc-200 bg-white hover:bg-zinc-50"
      }`}
      onClick={() => router.push(href)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-900 leading-snug">{label}</p>
          {caption && (
            <p className={`mt-0.5 truncate text-xs ${revisionReview ? "font-medium text-red-600" : "text-zinc-500"}`}>
              {caption}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusClassName}`}>
            {statusLabel}
          </span>
          <p className="whitespace-nowrap text-xs text-zinc-500">
            {expectedDeliveryLabel ? (
              <>
                Expected {expectedDeliveryLabel}
                {isOverdue && (
                  <span className="ml-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                    Overdue
                  </span>
                )}
              </>
            ) : (
              "No delivery date set"
            )}
          </p>
        </div>
      </div>
      {revisionReview && (
        <div
          className="mt-2.5 flex items-center gap-2 border-t border-red-200 pt-2.5"
          onClick={(e) => e.stopPropagation()}
        >
          <RevisionReviewDrawer
            project={revisionReview.project}
            reviews={revisionReview.reviews}
            pbdbFile={revisionReview.pbdbFile}
          />
        </div>
      )}
    </div>
  );
}
