export type QueueCategory = "new_submission" | "thread_reply" | "stakeholder_response";
export type MatchReason =
  | "token_match"
  | "mailbox_hash_projectid_match"
  | "stakeholder_table_fallback"
  | "no_match";
export type QueueStatus = "pending" | "approved" | "rejected" | "awaiting_clarification";

export interface QueueAttachmentView {
  filename: string;
  url: string | null;
}

export interface TargetRef {
  projectId: string;
  projectLabel: string;
  reviewId?: string;
  reviewLabel?: string;
}

// What a reviewer needs to decide on a stakeholder reply, computed on load
// (read-only) for open rows that have a proposed review.
export interface QueueReviewContext {
  cycle: number;
  stakeholderName: string;
  dispatchedAt: string | null;
  expiresAt: string | null;
  // "link expired" / "already responded" when the tag isn't a live match.
  note: string | null;
  // Is the sender on this project's reviewer list (or the reviewer/submitter)?
  senderVerified: boolean;
}

export interface QueueRow {
  id: string;
  receivedAt: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  textBody: string | null;
  // Only what the sender wrote this time, without the quoted thread.
  strippedReply: string | null;
  attachments: QueueAttachmentView[];
  proposedCategory: QueueCategory;
  proposedTarget: TargetRef | null;
  matchReason: MatchReason;
  status: QueueStatus;
  resolvedCategory: QueueCategory | null;
  resolvedTarget: TargetRef | null;
  resolvedAt: string | null;
  rejectionReason: string | null;
  clarificationRequestedAt: string | null;
  clarificationCandidates: { projectLabel: string; reviewLabel: string }[] | null;
  clarificationReplyText: string | null;
  clarificationMessage: string | null;
  clarificationExpiresAt: string | null;
  context: QueueReviewContext | null;
}

export const CATEGORY_LABEL: Record<QueueCategory, string> = {
  new_submission: "New submission",
  thread_reply: "Thread reply",
  stakeholder_response: "Stakeholder response",
};

export const MATCH_REASON_LABEL: Record<MatchReason, string> = {
  token_match: "Reply-to token matched",
  mailbox_hash_projectid_match: "Mailbox hash → project ID matched",
  stakeholder_table_fallback: "Sender found in stakeholders table (no token)",
  no_match: "No prior thread — treated as a fresh submission",
};

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}
