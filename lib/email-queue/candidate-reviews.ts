import type { SupabaseClient } from "@supabase/supabase-js";

export interface CandidateReview {
  reviewId: string;
  projectId: string;
  projectLabel: string;
  reviewLabel: string;
}

function projectLabel(p: { project_number: string | null; site_address: string | null; id: string } | null): string {
  if (!p) return "";
  return p.project_number || p.site_address || p.id.slice(0, 8);
}

// A stakeholder_table_fallback queue entry (#101 follow-up) carries no
// project/review link — the sender matched the `stakeholders` table but sent
// no reply token, so there's nothing to resolve it against. This looks up
// that sender's own still-open review cycles by email, used both to render
// suggestion chips in the admin's Reassign panel and to build the numbered
// list offered in a "request clarification" email.
export async function getCandidateReviewsForSender(
  supabase: SupabaseClient,
  email: string
): Promise<CandidateReview[]> {
  const { data } = await supabase
    .from("stakeholder_reviews")
    .select("id, review_cycle, stakeholder_name, project_id, projects(id, project_number, site_address)")
    .ilike("stakeholder_email", email)
    .eq("status", "pending")
    .order("dispatched_at", { ascending: false })
    .limit(10);

  return (data ?? []).map((r) => {
    const project = r.projects as unknown as { id: string; project_number: string | null; site_address: string | null } | null;
    return {
      reviewId: r.id as string,
      projectId: r.project_id as string,
      projectLabel: projectLabel(project),
      reviewLabel: `Cycle ${r.review_cycle} — ${r.stakeholder_name}`,
    };
  });
}
