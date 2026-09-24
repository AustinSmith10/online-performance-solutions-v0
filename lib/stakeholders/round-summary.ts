// Response tally for a review round, shown as a chip wherever a project's
// reviewer progress matters (project header, dashboards, review drawer).

export interface RoundSummary {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
}

const APPROVED = new Set(["approved_without_comments", "approved_with_comments"]);
const REJECTED = new Set(["rejected_with_comments", "rejected_without_comments"]);

/** Waived and superseded rows count toward `total` only — they neither approve nor reject. */
export function summarizeRound(reviews: { status: string }[]): RoundSummary {
  return {
    total: reviews.length,
    approved: reviews.filter((r) => APPROVED.has(r.status)).length,
    rejected: reviews.filter((r) => REJECTED.has(r.status)).length,
    pending: reviews.filter((r) => r.status === "pending").length,
  };
}

/** "1 rejected · 1 pending" — only the non-zero parts, null when there is nothing to report. */
export function formatRoundTally(s: RoundSummary): string | null {
  if (s.total === 0) return null;
  const parts = [
    s.approved > 0 ? `${s.approved} approved` : null,
    s.rejected > 0 ? `${s.rejected} rejected` : null,
    s.pending > 0 ? `${s.pending} pending` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}
