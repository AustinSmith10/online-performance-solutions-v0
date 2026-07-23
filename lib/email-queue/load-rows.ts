import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueueAttachmentView, QueueRow, TargetRef } from "@/components/email-queue/types";

type ProjectJoin = { id: string; project_number: string | null; site_address: string | null } | null;
type ReviewJoin = { id: string; review_cycle: number; stakeholder_name: string } | null;

function projectLabel(p: ProjectJoin): string {
  if (!p) return "";
  return p.project_number || p.site_address || p.id.slice(0, 8);
}

function reviewLabel(r: ReviewJoin): string {
  if (!r) return "";
  return `Cycle ${r.review_cycle} — ${r.stakeholder_name}`;
}

function buildTarget(project: ProjectJoin, review: ReviewJoin): TargetRef | null {
  if (!project) return null;
  return {
    projectId: project.id,
    projectLabel: projectLabel(project),
    ...(review ? { reviewId: review.id, reviewLabel: reviewLabel(review) } : {}),
  };
}

// Shared by both role-scoped email-queue pages (admin + consultant, #101) so
// the query, attachment signing, and row-shaping logic exist in one place.
export async function loadEmailQueueRows(supabase: SupabaseClient): Promise<QueueRow[]> {
  const { data } = await supabase
    .from("inbound_email_queue")
    .select(
      `
      id, received_at, from_email, from_name, subject, text_body, attachment_paths,
      proposed_category, match_reason,
      status, resolved_category, resolved_at, rejection_reason,
      clarification_requested_at, clarification_candidates, clarification_reply_text, clarification_message,
      proposed_project:projects!inbound_email_queue_proposed_project_id_fkey(id, project_number, site_address),
      proposed_review:stakeholder_reviews!inbound_email_queue_proposed_stakeholder_review_id_fkey(id, review_cycle, stakeholder_name),
      resolved_project:projects!inbound_email_queue_resolved_project_id_fkey(id, project_number, site_address),
      resolved_review:stakeholder_reviews!inbound_email_queue_resolved_stakeholder_review_id_fkey(id, review_cycle, stakeholder_name)
    `
    )
    .order("received_at", { ascending: false })
    .limit(300);

  return Promise.all(
    (data ?? []).map(async (r) => {
      const attachmentRefs = (r.attachment_paths ?? []) as { path: string; filename: string; content_type: string }[];
      const attachments: QueueAttachmentView[] = await Promise.all(
        attachmentRefs.map(async (a) => {
          const { data: signed } = await supabase.storage.from("pending-inbound").createSignedUrl(a.path, 3600);
          return { filename: a.filename, url: signed?.signedUrl ?? null };
        })
      );

      return {
        id: r.id as string,
        receivedAt: r.received_at as string,
        fromEmail: r.from_email as string,
        fromName: r.from_name as string | null,
        subject: r.subject as string | null,
        textBody: r.text_body as string | null,
        attachments,
        proposedCategory: r.proposed_category as QueueRow["proposedCategory"],
        proposedTarget: buildTarget(
          r.proposed_project as unknown as ProjectJoin,
          r.proposed_review as unknown as ReviewJoin
        ),
        matchReason: r.match_reason as QueueRow["matchReason"],
        status: r.status as QueueRow["status"],
        resolvedCategory: (r.resolved_category as QueueRow["resolvedCategory"]) ?? null,
        resolvedTarget: buildTarget(
          r.resolved_project as unknown as ProjectJoin,
          r.resolved_review as unknown as ReviewJoin
        ),
        resolvedAt: r.resolved_at as string | null,
        rejectionReason: r.rejection_reason as string | null,
        clarificationRequestedAt: r.clarification_requested_at as string | null,
        clarificationCandidates: (r.clarification_candidates as QueueRow["clarificationCandidates"]) ?? null,
        clarificationReplyText: r.clarification_reply_text as string | null,
        clarificationMessage: r.clarification_message as string | null,
      };
    })
  );
}
