export interface ReviewerForResetWarning {
  name: string;
  /** stakeholder_reviews.status */
  status: string;
}

const APPROVED_STATUSES = new Set(["approved_without_comments", "approved_with_comments"]);
const REJECTED_STATUSES = new Set(["rejected_with_comments"]);

/**
 * Builds the #193 dynamic reset-warning copy for a `post_dispatch_revision`
 * upload, naming the affected stakeholders and counting them by their
 * current response so the consultant knows exactly what a re-upload throws
 * away.
 */
export function buildResetWarningCopy(reviewers: ReviewerForResetWarning[]): string {
  const approved = reviewers.filter((r) => APPROVED_STATUSES.has(r.status));
  const rejected = reviewers.filter((r) => REJECTED_STATUSES.has(r.status));

  const parts: string[] = [];
  if (approved.length > 0) {
    parts.push(`${approved.map((r) => r.name).join(", ")} (${approved.length} already approved)`);
  }
  if (rejected.length > 0) {
    parts.push(`${rejected.map((r) => r.name).join(", ")} (${rejected.length} rejected)`);
  }

  if (parts.length === 0) {
    return "This resets approvals for this cycle — everyone will need to review again once you redispatch.";
  }

  return `This resets approvals from ${parts.join(" and ")} — everyone will need to review again once you redispatch.`;
}
