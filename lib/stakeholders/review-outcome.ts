import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notifications/notify";
import { renderModificationsRequestedEmail } from "@/lib/email/templates/ModificationsRequestedEmail";
import { scheduleOrDeliverPbdr } from "@/lib/documents/pending-delivery";

/** Human-friendly reference for a project: site address, else project number, else a short id. */
export function resolveProjectRef(
  project: { extracted_fields: unknown; project_number: unknown },
  projectId: string
): string {
  return (
    (project.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ??
    (project.project_number as string | null) ??
    projectId.slice(0, 8)
  );
}

export interface NotifyModificationsRequestedParams {
  supabase: SupabaseClient;
  projectId: string;
  reviewCycle: number;
  projectRef: string;
  stakeholderName: string;
  comments: string | null;
  qaCompletedBy: string | null;
  assignedConsultantId: string | null;
  /** e.g. "rejected" or "requested changes to" */
  messageVerb: string;
  /** e.g. "Rejection received" or "Changes requested" */
  subjectLabel: string;
}

/** Notifies the QA'ing/assigned consultant plus all admins that a stakeholder rejected a review. */
export async function notifyModificationsRequested({
  supabase,
  projectId,
  reviewCycle,
  projectRef,
  stakeholderName,
  comments,
  qaCompletedBy,
  assignedConsultantId,
  messageVerb,
  subjectLabel,
}: NotifyModificationsRequestedParams): Promise<void> {
  const { data: allRejected } = await supabase
    .from("stakeholder_reviews")
    .select("stakeholder_name, comments")
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle)
    .in("status", ["rejected_with_comments", "rejected_without_comments"]);

  const modifications = (allRejected ?? [])
    .filter((r) => r.comments)
    .map((r) => ({
      stakeholderName: r.stakeholder_name as string,
      comments: r.comments as string,
    }));

  const consultantId = qaCompletedBy ?? assignedConsultantId;
  const recipientIds: string[] = [...(consultantId ? [consultantId] : [])];
  const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
  for (const a of admins ?? []) recipientIds.push(a.id as string);

  const projectUrl = `${process.env.NEXT_PUBLIC_APP_URL}/ops/projects/${projectId}`;
  const { data: recipientRows } = await supabase
    .from("users")
    .select("id, first_name")
    .in("id", recipientIds);

  const commentSuffix = comments
    ? ` — "${comments.slice(0, 80)}${comments.length > 80 ? "…" : ""}"`
    : ".";

  await Promise.all(
    (recipientRows ?? []).map((u) => {
      const firstName = (u.first_name as string | null) ?? "there";
      const emailHtml = renderModificationsRequestedEmail({
        consultantName: firstName,
        projectId: projectRef,
        modifications,
        projectUrl,
      });
      return notify({
        recipientId: u.id as string,
        type: "modifications_requested",
        message: `${stakeholderName} ${messageVerb} ${projectRef}${commentSuffix}`,
        projectId,
        emailSubject: `${subjectLabel} — ${projectRef}`,
        emailHtml,
      }).catch(() => {});
    })
  );
}

/**
 * A review cycle is fully approved once no review is left `pending` or
 * still-rejected (`rejected_with_comments`/`rejected_without_comments`) — a
 * rejection that hasn't been superseded by a new cycle must keep blocking
 * auto-delivery even if every other stakeholder has since approved.
 */
export async function autoDeliverIfFullyApproved(
  supabase: SupabaseClient,
  projectId: string,
  reviewCycle: number,
  logPrefix: string
): Promise<void> {
  const { data: outstanding } = await supabase
    .from("stakeholder_reviews")
    .select("id")
    .eq("project_id", projectId)
    .eq("review_cycle", reviewCycle)
    .in("status", ["pending", "rejected_with_comments", "rejected_without_comments"]);

  if (!outstanding || outstanding.length === 0) {
    scheduleOrDeliverPbdr(projectId).catch((err) => {
      console.error(`${logPrefix} auto-deliver-pbdr failed for ${projectId}:`, err);
    });
  }
}
