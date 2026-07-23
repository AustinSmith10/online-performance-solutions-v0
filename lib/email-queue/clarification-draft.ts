import type { CandidateReview } from "./candidate-reviews";

// Plain-text starting point for the "request clarification" compose box —
// the admin/consultant can send this as-is or rewrite it entirely before it
// goes out (#101 follow-up: the email is free-text, not a fixed template).
export function buildDefaultClarificationDraft(candidates: Pick<CandidateReview, "projectLabel">[]): string {
  if (candidates.length > 0) {
    // Address only — "Cycle N" is our internal review-cycle numbering and
    // means nothing to the stakeholder replying to their own email. A
    // trailing "Others:" line covers the case where none of their open
    // reviews are actually the right one.
    const list = candidates.map((c, i) => `${i + 1}. ${c.projectLabel}`).join("\n");
    const otherLine = `${candidates.length + 1}. Others: `;
    return `Thanks for your email — we couldn't match your response to your open reviews. Could you reply which project your review response is about?\n\n${list}\n${otherLine}`;
  }

  // A third-party stakeholder reviewing a report has no reason to know a PO
  // number or internal project reference — the property address, or the
  // filename of the document they were sent, is what they'll actually have
  // to hand.
  return "Thanks for your email — we couldn't find an open review to match your response to. Could you reply with the project address you were reviewing, or the filename of the document you reviewed?";
}
