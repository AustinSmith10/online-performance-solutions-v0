// Pure round-status helpers (#191). Split out of review-round.ts, which is
// server-only, so client-safe code and unit tests can share them.

export type RoundStatus = "open" | "closed_approved" | "closed_rejected" | "superseded";

export const REJECTED_STATUSES = new Set(["rejected_with_comments", "rejected_without_comments"]);

/** A round's status from its rows (a forced close leaves a mix of `superseded` and `closed_rejected`). */
export function deriveRoundStatus(rows: { round_status: string }[]): RoundStatus | null {
  if (rows.length === 0) return null;
  const statuses = new Set(rows.map((r) => r.round_status));
  if (statuses.has("open")) return "open";
  if (statuses.has("closed_rejected")) return "closed_rejected";
  if (statuses.has("closed_approved")) return "closed_approved";
  return "superseded";
}
