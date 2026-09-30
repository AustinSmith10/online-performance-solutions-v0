import type { SupabaseClient } from "@supabase/supabase-js";
import { hashToken } from "@/lib/stakeholders/tokens";

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

// A review the email's reply-to tag (Postmark MailboxHash) points at, with a
// note when that tag wasn't usable as an automatic match.
export interface TaggedReview extends CandidateReview {
  note: string | null;
}

// The webhook only auto-proposes a review when the tag's token is live: not
// expired and still pending. A stakeholder replying late, or after they've
// already responded, lands in the queue with no proposed target even though
// the tag still names exactly the right review. This resolves the tag
// regardless of expiry or status so the admin can be shown where the reply
// was addressed. Read-only: it never proposes or files anything itself.
export async function getReviewForMailboxHash(
  supabase: SupabaseClient,
  mailboxHash: string
): Promise<TaggedReview | null> {
  const { data } = await supabase
    .from("stakeholder_reviews")
    .select("id, review_cycle, stakeholder_name, project_id, status, expires_at, projects(id, project_number, site_address)")
    .eq("token_hash", hashToken(mailboxHash))
    .maybeSingle();

  if (!data) return null;

  const project = data.projects as unknown as { id: string; project_number: string | null; site_address: string | null } | null;
  const expired = new Date(data.expires_at as string) < new Date();
  const note = data.status !== "pending" ? "already responded" : expired ? "link expired" : null;

  return {
    reviewId: data.id as string,
    projectId: data.project_id as string,
    projectLabel: projectLabel(project),
    reviewLabel: `Cycle ${data.review_cycle} — ${data.stakeholder_name}`,
    note,
  };
}
