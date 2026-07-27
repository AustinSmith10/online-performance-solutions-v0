import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Projects a stakeholder can access beyond ones they submitted: any project
 * they've ever been asked to review, regardless of whether that review is
 * still pending. Excludes reviewers who only submitted, not requested.
 */
export async function getStakeholderReviewedProjectIds(
  supabase: SupabaseClient,
  email: string
): Promise<string[]> {
  const { data } = await supabase
    .from("stakeholder_reviews")
    .select("project_id")
    .eq("stakeholder_email", email);

  const ids = new Set((data ?? []).map((r) => r.project_id as string));
  return [...ids].filter((id) => UUID_RE.test(id));
}

/**
 * PostgREST `.or()` filter string for what a stakeholder may see: what they
 * submitted, or what they've been asked to review. Without this, every
 * stakeholder at an org saw every project any org member ever submitted.
 * Pass to `.or(...)` on a `projects` query already scoped to `client_id`.
 */
export function stakeholderAccessFilter(userId: string, reviewedProjectIds: string[]): string {
  const base = `submitted_by.eq.${userId}`;
  if (reviewedProjectIds.length === 0) return base;
  return `${base},id.in.(${reviewedProjectIds.join(",")})`;
}
