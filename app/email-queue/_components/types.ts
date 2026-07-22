export type QueueCategory = "new_submission" | "thread_reply" | "stakeholder_response";
export type MatchReason =
  | "token_match"
  | "mailbox_hash_projectid_match"
  | "stakeholder_table_fallback"
  | "no_match";
export type QueueStatus = "pending" | "approved" | "rejected";

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

export interface QueueRow {
  id: string;
  receivedAt: string;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  textBody: string | null;
  attachments: QueueAttachmentView[];
  proposedCategory: QueueCategory;
  proposedTarget: TargetRef | null;
  matchReason: MatchReason;
  status: QueueStatus;
  resolvedCategory: QueueCategory | null;
  resolvedTarget: TargetRef | null;
  resolvedAt: string | null;
  rejectionReason: string | null;
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
