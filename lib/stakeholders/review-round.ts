import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit/log";
import { recordRevisionEvent } from "@/lib/documents/revision-history";

// A stakeholder review round (= review cycle, #191): every dispatch or
// redispatch needs *all* stakeholders to approve. One rejection sends the
// project to "revision required" straight away, but the round itself only
// closes in one of two ways:
//
// - Natural: no row of the cycle is left `pending`. Any rejection closes it
//   `closed_rejected` and bumps the PBDB revision number once; otherwise it
//   closes `closed_approved` (no bump).
// - Forced: the consultant uploads a revised PBDB while reviews are still
//   pending. Still-pending rows become `superseded` (internal only), and the
//   revision number bumps only if a rejection was already recorded.
//
// round_status is stored on every row of the cycle; the close is a
// conditional `open → closed_*` update, so of two responses racing to close
// the same round exactly one wins and bumps.

export type RoundStatus = "open" | "closed_approved" | "closed_rejected" | "superseded";

const REJECTED_STATUSES = new Set(["rejected_with_comments", "rejected_without_comments"]);

interface RoundRow {
  status: string;
  round_status: string;
}

/** A round's status from its rows (a forced close leaves a mix of `superseded` and `closed_rejected`). */
export function deriveRoundStatus(rows: { round_status: string }[]): RoundStatus | null {
  if (rows.length === 0) return null;
  const statuses = new Set(rows.map((r) => r.round_status));
  if (statuses.has("open")) return "open";
  if (statuses.has("closed_rejected")) return "closed_rejected";
  if (statuses.has("closed_approved")) return "closed_approved";
  return "superseded";
}

export async function getRoundStatus(
  supabase: SupabaseClient,
  projectId: string,
  reviewCycle: number
): Promise<RoundStatus | null> {
  const { data } = await supabase
    .from("stakeholder_reviews")
    .select("round_status")
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle);
  return deriveRoundStatus((data ?? []) as { round_status: string }[]);
}

/** Bumps the PBDB revision number for this round, unless it already was. */
async function bumpRevisionForRound(
  supabase: SupabaseClient,
  projectId: string,
  reviewCycle: number
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("revision_history")
    .select("id")
    .eq("project_id", projectId)
    .eq("doc_type", "pbdb")
    .eq("event", "rejected")
    .eq("review_cycle", reviewCycle)
    .limit(1);
  if (existing && existing.length > 0) return false;
  await recordRevisionEvent(supabase, projectId, "pbdb", "rejected", reviewCycle);
  return true;
}

export interface RoundCloseResult {
  closed: "closed_approved" | "closed_rejected" | null;
  revisionBumped: boolean;
}

/**
 * The one "round ended" check, called after anything that moves a review
 * out of `pending` (a response, a waiver). Closes the round only once every
 * row has left `pending`; a no-op while any is still pending, or if the
 * round was already closed.
 */
export async function closeRoundIfComplete(
  supabase: SupabaseClient,
  projectId: string,
  reviewCycle: number
): Promise<RoundCloseResult> {
  const none: RoundCloseResult = { closed: null, revisionBumped: false };
  const { data } = await supabase
    .from("stakeholder_reviews")
    .select("status, round_status")
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle);
  const rows = (data ?? []) as RoundRow[];

  if (rows.length === 0) return none;
  if (deriveRoundStatus(rows) !== "open") return none;
  if (rows.some((r) => r.status === "pending")) return none;

  const outcome = rows.some((r) => REJECTED_STATUSES.has(r.status)) ? "closed_rejected" : "closed_approved";

  const { count } = await supabase
    .from("stakeholder_reviews")
    .update({ round_status: outcome }, { count: "exact" })
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle)
    .eq("round_status", "open");
  if (!count) return none;

  const revisionBumped = outcome === "closed_rejected" ? await bumpRevisionForRound(supabase, projectId, reviewCycle) : false;
  return { closed: outcome, revisionBumped };
}

/** Whether forceCloseRound would bump the revision number right now — for building the revised upload's Rev{n} filename before the close itself runs. */
export async function forcedCloseWouldBump(
  supabase: SupabaseClient,
  projectId: string,
  reviewCycle: number
): Promise<boolean> {
  const { data } = await supabase
    .from("stakeholder_reviews")
    .select("status, round_status")
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle);
  const rows = (data ?? []) as RoundRow[];
  if (deriveRoundStatus(rows) !== "open") return false;
  if (!rows.some((r) => REJECTED_STATUSES.has(r.status))) return false;

  const { data: existing } = await supabase
    .from("revision_history")
    .select("id")
    .eq("project_id", projectId)
    .eq("doc_type", "pbdb")
    .eq("event", "rejected")
    .eq("review_cycle", reviewCycle)
    .limit(1);
  return !existing || existing.length === 0;
}

export interface ForcedCloseResult {
  closed: boolean;
  revisionBumped: boolean;
  supersededStakeholders: { name: string; email: string }[];
}

/**
 * Forced close: a revised PBDB was uploaded while the round was still open.
 * Still-pending rows become `superseded` (never shown to stakeholders; no
 * longer counted as pending anywhere), the rest close with the round, and
 * the revision number bumps only if a rejection had already come in.
 */
export async function forceCloseRound(
  supabase: SupabaseClient,
  projectId: string,
  reviewCycle: number,
  actor: { id: string; email: string } | null
): Promise<ForcedCloseResult> {
  const { data } = await supabase
    .from("stakeholder_reviews")
    .select("status, round_status, stakeholder_name, stakeholder_email")
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle);
  const rows = (data ?? []) as (RoundRow & { stakeholder_name: string; stakeholder_email: string })[];

  if (deriveRoundStatus(rows) !== "open") {
    return { closed: false, revisionBumped: false, supersededStakeholders: [] };
  }

  const hadRejection = rows.some((r) => REJECTED_STATUSES.has(r.status));
  const stillPending = rows
    .filter((r) => r.status === "pending")
    .map((r) => ({ name: r.stakeholder_name, email: r.stakeholder_email }));

  const { count } = await supabase
    .from("stakeholder_reviews")
    .update({ status: "superseded", round_status: "superseded" }, { count: "exact" })
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle)
    .eq("status", "pending")
    .eq("round_status", "open");

  await supabase
    .from("stakeholder_reviews")
    .update({ round_status: hadRejection ? "closed_rejected" : "superseded" })
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle)
    .eq("round_status", "open");

  // A round with nothing pending should already have closed naturally —
  // only bump/audit when this call is what actually closed it.
  if (!count && stillPending.length > 0) {
    return { closed: false, revisionBumped: false, supersededStakeholders: [] };
  }

  const revisionBumped = hadRejection ? await bumpRevisionForRound(supabase, projectId, reviewCycle) : false;

  await auditLog("project.round_force_closed", actor?.id ?? null, actor?.email ?? null, {
    projectId,
    metadata: {
      review_cycle: reviewCycle,
      had_rejection: hadRejection,
      revision_bumped: revisionBumped,
      still_pending: stillPending,
    },
  });

  return { closed: true, revisionBumped, supersededStakeholders: stillPending };
}
