import { LogStakeholderResponseForm, type ExistingResponse } from "./LogStakeholderResponseForm";
import type { ResponseMode } from "@/app/actions/stakeholders";
import type { ReviewRoundStatus } from "@/types";

export interface ReviewResponseRow {
  id: string;
  stakeholder_name: string;
  stakeholder_email: string;
  status: string;
  comments: string | null;
  responded_at: string | null;
  response_mode: string | null;
  respondent_name: string | null;
  email_reply_text: string | null;
}

/**
 * The per-reviewer response control on the current review round (#192).
 * While the round is open every reviewer gets it — "Log response" for a
 * pending one, "Replace response" (with the existing response shown and an
 * explicit replace confirmation) for one who already responded, whether
 * logged on their behalf or submitted by them via the portal/link. Once the
 * round closes it becomes read-only: "Round closed — Revision N".
 */
export function ReviewResponseControl({
  review,
  projectId,
  roundStatus,
  revisionNumber,
  pendingCount,
  roster,
  evidence,
  loggedByEmail,
}: {
  review: ReviewResponseRow;
  projectId: string;
  roundStatus: ReviewRoundStatus | null;
  revisionNumber: number;
  // Reviews in the round still pending — the last one's response closes it.
  pendingCount: number;
  roster: { name: string; email: string }[];
  evidence?: { storagePath: string; filename: string } | null;
  loggedByEmail?: string | null;
}) {
  if (roundStatus === "closed_approved" || roundStatus === "closed_rejected") {
    return <p className="shrink-0 text-xs text-zinc-500">Round closed — Revision {revisionNumber}</p>;
  }
  if (roundStatus !== "open" || review.status === "superseded") return null;

  const isPending = review.status === "pending";
  const existing: ExistingResponse | undefined = isPending
    ? undefined
    : {
        status: review.status,
        comments: review.comments,
        respondedAt: review.responded_at,
        responseMode: (review.response_mode as ResponseMode | null) ?? null,
        respondentName: review.respondent_name,
        loggedByEmail: loggedByEmail ?? null,
        evidenceFilename: evidence?.filename ?? null,
      };

  return (
    <LogStakeholderResponseForm
      reviewId={review.id}
      projectId={projectId}
      stakeholderName={review.stakeholder_name}
      stakeholderEmail={review.stakeholder_email}
      roster={roster}
      prefilledEvidence={isPending ? (evidence ?? undefined) : undefined}
      prefilledComments={isPending ? (review.email_reply_text ?? undefined) : undefined}
      existing={existing}
      closesRound={isPending && pendingCount === 1}
    />
  );
}
