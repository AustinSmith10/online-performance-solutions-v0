import type { SupabaseClient } from "@supabase/supabase-js";

export type PbdbDispatchReadiness =
  // in_progress + QA complete, this cycle never dispatched
  | { kind: "initial" }
  // dispatched | revision_required with zero stakeholder_reviews rows for the
  // current cycle — either a fresh revised upload awaiting redispatch, or the
  // #166 outage signature (status advanced, rows never written). Either way
  // the UI must let it be (re)dispatched.
  | { kind: "redispatch" }
  | { kind: "not_ready"; reason: string };

export interface PbdbDispatchReadinessInput {
  status: string;
  qaCompletedBy: string | null;
  /** stakeholder_reviews row count for the project's CURRENT review_cycle. */
  currentCycleReviewCount: number;
}

/**
 * The single rule for "can this project's PBDB be dispatched right now",
 * shared by the `dispatchToStakeholders` server action and the consultant
 * project card's `pbdbCardState` so the two can't drift. Before this existed
 * the action recognised only `in_progress + qa_completed_by` or
 * `revision_required + 0 rows`, so a `dispatched + 0 rows` project (the
 * outage signature) could not be recovered through the UI — that's the
 * "Project is not ready for dispatch" dialog testers hit.
 */
export function classifyPbdbDispatchReadiness(
  input: PbdbDispatchReadinessInput
): PbdbDispatchReadiness {
  const { status, qaCompletedBy, currentCycleReviewCount } = input;

  if (status === "dispatched" || status === "revision_required") {
    return currentCycleReviewCount === 0
      ? { kind: "redispatch" }
      : { kind: "not_ready", reason: "This review cycle has already been dispatched." };
  }

  if (status === "in_progress") {
    return qaCompletedBy
      ? { kind: "initial" }
      : { kind: "not_ready", reason: "Upload and QA the PBDB before dispatching." };
  }

  return {
    kind: "not_ready",
    reason: "This project isn't at a stage where the PBDB can be dispatched.",
  };
}

/**
 * Async wrapper for callers that hold a project row but not the current
 * cycle's review-row count (the server action). Does the count query, then
 * defers to {@link classifyPbdbDispatchReadiness}.
 */
export async function getPbdbDispatchReadiness(
  supabase: SupabaseClient,
  project: { id: string; status: string; qa_completed_by: string | null; review_cycle: number }
): Promise<PbdbDispatchReadiness> {
  const { count } = await supabase
    .from("stakeholder_reviews")
    .select("id", { count: "exact", head: true })
    .eq("project_id", project.id)
    .eq("review_cycle", project.review_cycle);

  return classifyPbdbDispatchReadiness({
    status: project.status,
    qaCompletedBy: project.qa_completed_by,
    currentCycleReviewCount: count ?? 0,
  });
}
