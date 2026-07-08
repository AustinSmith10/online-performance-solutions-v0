import type { Notification, FailedJob, BounceEvent } from "@/types";
import type {
  StalledProjectSignal,
  StakeholderReviewSignal,
  OverdueAssignmentSignal,
} from "@/lib/admin/needs-attention";
import { trayId } from "@/lib/notifications/tray-id";

export { trayId };

export type TrayEntryKind = "notification" | "hard_error" | "needs_attention";

// Shared poll cadence for admin-only needs-attention/hard-error signals —
// see NotificationToasts.tsx for why these can't ride on Supabase realtime.
export const NEEDS_ATTENTION_POLL_MS = 45_000;

export interface TrayEntry {
  id: string;
  kind: TrayEntryKind;
  message: string;
  href: string | null;
  timestamp: string;
  isRead: boolean;
  resolvable: boolean;
}

export function notificationToEntry(n: Notification, projectBasePath: string): TrayEntry {
  return {
    id: trayId.notification(n.id),
    kind: "notification",
    message: n.message,
    href: n.project_id ? `${projectBasePath}/${n.project_id}` : null,
    timestamp: n.created_at,
    isRead: n.is_read,
    resolvable: false,
  };
}

export function failedJobToEntry(job: FailedJob, projectBasePath: string): TrayEntry {
  const projectId = typeof job.data?.projectId === "string" ? job.data.projectId : null;
  let message = `${job.name} failed`;
  if (job.output?.message) message += `: ${job.output.message}`;
  if (job.retry_limit > 0) message += ` (${job.retry_count}/${job.retry_limit} retries)`;
  return {
    id: trayId.job(job.id),
    kind: "hard_error",
    message,
    href: projectId ? `${projectBasePath}/${projectId}` : null,
    timestamp: job.completed_on ?? job.created_on,
    isRead: false,
    resolvable: true,
  };
}

export function bounceEventToEntry(b: BounceEvent, projectBasePath: string): TrayEntry {
  return {
    id: trayId.bounce(b.id),
    kind: "hard_error",
    message: `Email bounced: ${b.email}${b.reason ? ` (${b.reason})` : ""}`,
    href: b.project_id ? `${projectBasePath}/${b.project_id}` : null,
    timestamp: b.created_at,
    isRead: false,
    resolvable: true,
  };
}

export function stalledProjectToEntry(
  p: StalledProjectSignal,
  projectBasePath: string
): TrayEntry {
  return {
    id: trayId.stalled(p.id),
    kind: "needs_attention",
    message: `Project ${p.project_number ?? p.id} looks stalled (still ${p.status.replace(/_/g, " ")})`,
    href: `${projectBasePath}/${p.id}`,
    timestamp: p.updated_at,
    isRead: false,
    resolvable: true,
  };
}

export function pendingReviewToEntry(
  r: StakeholderReviewSignal,
  projectBasePath: string
): TrayEntry {
  return {
    id: trayId.pending(r.id),
    kind: "needs_attention",
    message: `${r.stakeholder_name} hasn't responded to their review request`,
    href: `${projectBasePath}/${r.project_id}`,
    timestamp: r.dispatched_at,
    isRead: false,
    resolvable: true,
  };
}

export function expiringTokenToEntry(
  r: StakeholderReviewSignal,
  projectBasePath: string
): TrayEntry {
  return {
    id: trayId.expiring(r.id),
    kind: "needs_attention",
    message: `Approval link for ${r.stakeholder_name} expires soon`,
    href: `${projectBasePath}/${r.project_id}`,
    timestamp: r.expires_at,
    isRead: false,
    resolvable: true,
  };
}

export function overdueAssignmentToEntry(
  p: OverdueAssignmentSignal,
  projectBasePath: string
): TrayEntry {
  const ref =
    p.site_address ?? p.extracted_fields?.["EXTRACT_ADDRESS"] ?? p.project_number ?? p.po_number ?? p.id.slice(0, 8);
  return {
    id: trayId.overdue(p.id),
    kind: "needs_attention",
    message: `Assignment for ${ref} hasn't been accepted or declined within the accept window`,
    href: `${projectBasePath}/${p.id}`,
    timestamp: p.accept_overdue_alert_fired_at,
    isRead: false,
    resolvable: true,
  };
}

export function sortEntries(entries: TrayEntry[]): TrayEntry[] {
  return [...entries].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}
