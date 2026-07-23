import type { createAdminClient } from "@/lib/supabase/admin";
import type { FailedJob, BounceEvent, CreditRaceEvent } from "@/types";
import { trayId } from "@/lib/notifications/tray-id";

// Thresholds for the soft "needs attention" signals (issue #46). Not
// configurable in this slice — chosen relative to existing timing in the
// app (stakeholder tokens are valid for 5 working days; see
// lib/stakeholders/tokens.ts TOKEN_WORKING_DAYS):
//
// - A project is "stalled" if it hasn't been updated in 3+ days AND its
//   expected_delivery_date is unset, overdue, or within the next 3 days —
//   projects with plenty of runway left aren't flagged just for being quiet.
// - A stakeholder review is "pending too long" once 3+ days have passed
//   since dispatch with no response (regardless of whether its token has
//   since expired).
// - A review's token is "nearing expiry" once its expires_at is within the
//   next 24 hours and hasn't passed yet.
const STALLED_UPDATE_DAYS = 3;
const STALLED_DELIVERY_WINDOW_DAYS = 3;
const PENDING_REVIEW_DAYS = 3;
const EXPIRING_TOKEN_HOURS = 24;

export interface StalledProjectSignal {
  id: string;
  project_number: string | null;
  client_id: string;
  status: string;
  expected_delivery_date: string | null;
  updated_at: string;
}

export interface StakeholderReviewSignal {
  id: string;
  project_id: string;
  stakeholder_name: string;
  stakeholder_email: string;
  dispatched_at: string;
  expires_at: string;
}

export interface OverdueAssignmentSignal {
  id: string;
  project_number: string | null;
  po_number: string | null;
  site_address: string | null;
  extracted_fields: Record<string, string> | null;
  accept_overdue_alert_fired_at: string;
}

export interface NeedsAttentionSignals {
  failedJobs: FailedJob[];
  bounceEvents: BounceEvent[];
  creditRaceEvents: CreditRaceEvent[];
  stalledProjects: StalledProjectSignal[];
  pendingReviews: StakeholderReviewSignal[];
  expiringTokens: StakeholderReviewSignal[];
  overdueAssignments: OverdueAssignmentSignal[];
}

export async function getNeedsAttentionSignals(
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ data: NeedsAttentionSignals; error: string | null }> {
  const now = Date.now();
  const stalledUpdateCutoff = new Date(now - STALLED_UPDATE_DAYS * 86_400_000).toISOString();
  const deliveryWindowCutoff = new Date(now + STALLED_DELIVERY_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const pendingReviewCutoff = new Date(now - PENDING_REVIEW_DAYS * 86_400_000).toISOString();
  const expiringSoonCutoff = new Date(now + EXPIRING_TOKEN_HOURS * 3_600_000).toISOString();
  const nowIso = new Date(now).toISOString();

  const [
    { data: failedJobs, error: jobsError },
    { data: bounceEvents, error: bounceError },
    { data: creditRaceEvents, error: creditRaceError },
    { data: stalledProjects, error: stalledError },
    { data: pendingReviews, error: pendingError },
    { data: expiringTokens, error: expiringError },
    { data: overdueAssignments, error: overdueError },
    { data: resolved, error: resolvedError },
  ] = await Promise.all([
    supabase.rpc("get_failed_jobs"),
    supabase
      .from("bounce_events")
      .select("id, email, project_id, reason, created_at, resolved_at")
      .is("resolved_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("credit_race_events")
      .select("id, client_id, project_id, event_type, detected_at, resolved_at")
      .is("resolved_at", null)
      .order("detected_at", { ascending: false })
      .limit(100),
    supabase
      .from("projects")
      .select("id, project_number, client_id, status, expected_delivery_date, updated_at")
      .is("deleted_at", null)
      .not("status", "in", "(complete,delivered,paused)")
      .lt("updated_at", stalledUpdateCutoff)
      .or(`expected_delivery_date.is.null,expected_delivery_date.lte.${deliveryWindowCutoff}`)
      .order("updated_at", { ascending: true })
      .limit(50),
    supabase
      .from("stakeholder_reviews")
      .select("id, project_id, stakeholder_name, stakeholder_email, dispatched_at, expires_at")
      .eq("status", "pending")
      .lt("dispatched_at", pendingReviewCutoff)
      .order("dispatched_at", { ascending: true })
      .limit(50),
    supabase
      .from("stakeholder_reviews")
      .select("id, project_id, stakeholder_name, stakeholder_email, dispatched_at, expires_at")
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .lt("expires_at", expiringSoonCutoff)
      .order("expires_at", { ascending: true })
      .limit(50),
    supabase
      .from("projects")
      .select("id, project_number, po_number, site_address, extracted_fields, accept_overdue_alert_fired_at")
      .not("accept_overdue_alert_fired_at", "is", null)
      .is("accepted_at", null)
      .order("accept_overdue_alert_fired_at", { ascending: true })
      .limit(50),
    supabase.from("resolved_signals").select("signal_id"),
  ]);

  const error =
    jobsError?.message ??
    bounceError?.message ??
    creditRaceError?.message ??
    stalledError?.message ??
    pendingError?.message ??
    expiringError?.message ??
    overdueError?.message ??
    resolvedError?.message ??
    null;

  const resolvedIds = new Set(
    ((resolved ?? []) as { signal_id: string }[]).map((r) => r.signal_id)
  );

  return {
    data: {
      failedJobs: ((failedJobs ?? []) as FailedJob[]).filter(
        (j) => !resolvedIds.has(trayId.job(j.id))
      ),
      bounceEvents: ((bounceEvents ?? []) as BounceEvent[]).filter(
        (b) => !resolvedIds.has(trayId.bounce(b.id))
      ),
      creditRaceEvents: ((creditRaceEvents ?? []) as CreditRaceEvent[]).filter(
        (c) => !resolvedIds.has(trayId.creditRace(c.id))
      ),
      stalledProjects: ((stalledProjects ?? []) as StalledProjectSignal[]).filter(
        (p) => !resolvedIds.has(trayId.stalled(p.id))
      ),
      pendingReviews: ((pendingReviews ?? []) as StakeholderReviewSignal[]).filter(
        (r) => !resolvedIds.has(trayId.pending(r.id))
      ),
      expiringTokens: ((expiringTokens ?? []) as StakeholderReviewSignal[]).filter(
        (r) => !resolvedIds.has(trayId.expiring(r.id))
      ),
      overdueAssignments: ((overdueAssignments ?? []) as OverdueAssignmentSignal[]).filter(
        (p) => !resolvedIds.has(trayId.overdue(p.id))
      ),
    },
    error,
  };
}
