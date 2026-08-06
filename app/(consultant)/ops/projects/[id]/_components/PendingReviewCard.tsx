import { HighlightRing } from "@/components/HighlightRing";
import { ResendTokenButton } from "@/app/(admin)/admin/projects/[id]/_components/ResendTokenButton";
import { LogStakeholderResponseForm } from "./LogStakeholderResponseForm";
import { UpdateEmailReveal } from "@/app/(admin)/admin/projects/[id]/_components/UpdateEmailReveal";
import { WaiveForm } from "@/app/(admin)/admin/projects/[id]/_components/WaiveForm";

interface PendingReview {
  id: string;
  stakeholder_name: string;
  stakeholder_email: string;
  email_reply_text: string | null;
  email_reply_sender_verified: boolean | null;
}

/**
 * One still-pending stakeholder's action row — log their response on their
 * behalf, update a bad email address, resend their review link, or waive
 * them entirely. Shared between the "Awaiting stakeholder review" and
 * "Revision requested" Right Now cards (the latter needs these same actions
 * for whichever stakeholder(s) in the cycle haven't responded yet, not just
 * the one who rejected — a consultant shouldn't have to leave the Focus Card
 * to chase them down).
 */
export function PendingReviewCard({
  review,
  projectId,
  stakeholderRoster,
  evidence,
  highlighted,
}: {
  review: PendingReview;
  projectId: string;
  stakeholderRoster: { name: string; email: string }[];
  evidence?: { storagePath: string; filename: string } | null;
  highlighted?: boolean;
}) {
  const inner = (
    <div className="space-y-2 rounded-md border border-amber-200 bg-white px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900">{review.stakeholder_name}</p>
        <p className="truncate text-xs text-zinc-500">{review.stakeholder_email}</p>
      </div>
      {review.email_reply_text && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-amber-800">Replied by email — needs action</p>
            {review.email_reply_sender_verified === false && (
              <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                Unverified sender
              </span>
            )}
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-amber-900">
            {review.email_reply_text}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <ResendTokenButton reviewId={review.id} projectId={projectId} />
        <LogStakeholderResponseForm
          reviewId={review.id}
          projectId={projectId}
          stakeholderName={review.stakeholder_name}
          stakeholderEmail={review.stakeholder_email}
          roster={stakeholderRoster}
          prefilledEvidence={evidence ?? undefined}
          prefilledComments={review.email_reply_text ?? undefined}
        />
        <UpdateEmailReveal reviewId={review.id} projectId={projectId} currentEmail={review.stakeholder_email} />
        <WaiveForm reviewId={review.id} projectId={projectId} stakeholderName={review.stakeholder_name} requireEvidence />
      </div>
    </div>
  );

  return <div>{highlighted ? <HighlightRing>{inner}</HighlightRing> : inner}</div>;
}
