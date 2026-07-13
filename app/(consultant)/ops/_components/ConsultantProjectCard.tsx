"use client";

import { useRouter } from "next/navigation";
import { RevisionReviewDrawer, type RevisionProject, type ReviewRow, type PbdbFile } from "./RevisionReviewDrawer";
import { InlineAssignmentActions } from "./InlineAssignmentActions";

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
  // Admin-pushed assignment awaiting this consultant's response. Renders the card
  // amber with inline Accept / Decline and makes it non-navigable — the detail page
  // is withheld until the job is accepted (issue #95).
  pendingAssignment?: { projectId: string };
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
  pendingAssignment,
}: Props) {
  const router = useRouter();
  const isPending = !!pendingAssignment;
  const caption = isPending
    ? [clientName, "assigned to you"].filter(Boolean).join(" · ") || null
    : [clientName, submitterName].filter(Boolean).join(" · ") || null;

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        isPending
          ? "border-amber-300 bg-amber-50"
          : revisionReview
            ? "cursor-pointer border-red-300 bg-red-50"
            : "cursor-pointer border-zinc-200 bg-white hover:bg-zinc-50"
      }`}
      onClick={isPending ? undefined : () => router.push(href)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-900 leading-snug">{label}</p>
          {caption && (
            <p
              className={`mt-0.5 truncate text-xs ${
                isPending
                  ? "font-medium text-amber-700"
                  : revisionReview
                    ? "font-medium text-red-600"
                    : "text-zinc-500"
              }`}
            >
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
      {pendingAssignment && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-amber-200 pt-2.5">
          <InlineAssignmentActions projectId={pendingAssignment.projectId} label={label} />
        </div>
      )}
    </div>
  );
}
