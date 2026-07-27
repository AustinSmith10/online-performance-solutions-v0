import type { ProjectStatus } from "@/types";

export type ReviewStatusRow = { status: string };

const OUTSTANDING_STATUSES = new Set(["pending", "rejected_with_comments", "rejected_without_comments"]);

/**
 * The status every surface should treat a project as being in — the single
 * source of truth for "Right now." Collapses the gap between "every
 * current-cycle stakeholder review has resolved" and the DB actually
 * flipping to "converting": that only happens once
 * scheduleOrDeliverPbdr's scheduled delivery job runs (lib/documents/pending-delivery.ts),
 * which can lag the last approval by a working day or more depending on the
 * project's delivery_delay_preset.
 *
 * Badges, tab/list bucketing, and the stage rail should all call this once
 * and derive their display from its result — not separately recompute "is
 * everything approved," which is what let those surfaces drift out of sync
 * with each other (dashboard list, project detail, stepper all disagreeing
 * about whether a project was still "awaiting approval").
 */
export function resolveEffectiveStatus(
  status: ProjectStatus,
  currentCycleReviews: ReviewStatusRow[]
): ProjectStatus {
  if (status !== "dispatched") return status;
  if (currentCycleReviews.length === 0) return status;
  const hasOutstanding = currentCycleReviews.some((r) => OUTSTANDING_STATUSES.has(r.status));
  return hasOutstanding ? status : "converting";
}
