"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import {
  executeQueueRowResolution,
  type QueueAttachmentRef,
  type QueueRowForExecution,
  type ResolvedTarget,
} from "@/lib/email/execute-resolution";

const QUEUE_ROUTE = "/email-queue";

export interface QueueActionState {
  error?: string;
}

export type QueueCategory = "new_submission" | "thread_reply" | "stakeholder_response";

interface QueueDbRow {
  id: string;
  status: string;
  from_email: string;
  from_name: string | null;
  subject: string | null;
  message_id: string | null;
  mailbox_hash: string | null;
  text_body: string | null;
  stripped_reply_text: string | null;
  received_at: string;
  attachment_paths: QueueAttachmentRef[] | null;
  proposed_category: QueueCategory | null;
  proposed_project_id: string | null;
  proposed_stakeholder_review_id: string | null;
}

function toExecutionRow(entry: QueueDbRow): QueueRowForExecution {
  return {
    id: entry.id,
    from_email: entry.from_email,
    from_name: entry.from_name,
    subject: entry.subject,
    message_id: entry.message_id,
    mailbox_hash: entry.mailbox_hash,
    text_body: entry.text_body,
    stripped_reply_text: entry.stripped_reply_text,
    received_at: entry.received_at,
    attachment_paths: entry.attachment_paths ?? [],
  };
}

function proposedTarget(entry: QueueDbRow): ResolvedTarget | null {
  switch (entry.proposed_category) {
    case "new_submission":
      return { category: "new_submission" };
    case "thread_reply":
      return entry.proposed_project_id ? { category: "thread_reply", projectId: entry.proposed_project_id } : null;
    case "stakeholder_response":
      return entry.proposed_stakeholder_review_id
        ? { category: "stakeholder_response", stakeholderReviewId: entry.proposed_stakeholder_review_id }
        : null;
    default:
      return null;
  }
}

async function markResolved(
  supabase: ReturnType<typeof createAdminClient>,
  queueId: string,
  target: ResolvedTarget,
  resultProjectId: string | undefined,
  actorId: string
) {
  await supabase
    .from("inbound_email_queue")
    .update({
      status: "approved",
      resolved_category: target.category,
      resolved_project_id:
        target.category === "thread_reply" ? target.projectId : (resultProjectId ?? null),
      resolved_stakeholder_review_id:
        target.category === "stakeholder_response" ? target.stakeholderReviewId : null,
      resolved_by: actorId,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", queueId);
}

// ── Approve as proposed ─────────────────────────────────────────────────────

export async function approveQueueEntry(queueId: string): Promise<QueueActionState> {
  const actor = await requireRole("super_admin", "admin", "consultant");
  const supabase = createAdminClient();

  const { data: entry } = await supabase
    .from("inbound_email_queue")
    .select("*")
    .eq("id", queueId)
    .maybeSingle();

  if (!entry) return { error: "Queue entry not found." };
  if ((entry as QueueDbRow).status !== "pending") return { error: "This entry has already been resolved." };

  const target = proposedTarget(entry as QueueDbRow);
  if (!target) return { error: "This entry has no proposed target — use Reassign instead." };

  const row = toExecutionRow(entry as QueueDbRow);
  const result = await executeQueueRowResolution(row, target, supabase);
  if (!result.ok) return { error: result.error ?? "Failed to process this entry." };

  await markResolved(supabase, queueId, target, result.projectId, actor.id as string);

  await auditLog("email_queue.approved", actor.id as string, actor.email as string, {
    metadata: { queue_id: queueId, category: target.category },
  });

  revalidatePath(QUEUE_ROUTE);
  return {};
}

// ── Reassign & approve ──────────────────────────────────────────────────────

export async function reassignQueueEntry(
  queueId: string,
  category: QueueCategory,
  projectId: string | null,
  stakeholderReviewId: string | null
): Promise<QueueActionState> {
  const actor = await requireRole("super_admin", "admin", "consultant");
  const supabase = createAdminClient();

  const { data: entry } = await supabase
    .from("inbound_email_queue")
    .select("*")
    .eq("id", queueId)
    .maybeSingle();

  if (!entry) return { error: "Queue entry not found." };
  if ((entry as QueueDbRow).status !== "pending") return { error: "This entry has already been resolved." };

  let target: ResolvedTarget;
  if (category === "new_submission") {
    target = { category: "new_submission" };
  } else if (category === "thread_reply") {
    if (!projectId) return { error: "Select a project." };
    target = { category: "thread_reply", projectId };
  } else {
    if (!projectId) return { error: "Select a project." };
    if (!stakeholderReviewId) return { error: "Select a review cycle." };
    target = { category: "stakeholder_response", stakeholderReviewId };
  }

  const row = toExecutionRow(entry as QueueDbRow);
  const result = await executeQueueRowResolution(row, target, supabase);
  if (!result.ok) return { error: result.error ?? "Failed to process this entry." };

  await markResolved(supabase, queueId, target, result.projectId, actor.id as string);

  await auditLog("email_queue.reassigned_and_approved", actor.id as string, actor.email as string, {
    metadata: {
      queue_id: queueId,
      category: target.category,
      original_category: (entry as QueueDbRow).proposed_category,
    },
  });

  revalidatePath(QUEUE_ROUTE);
  return {};
}

// ── Reject ───────────────────────────────────────────────────────────────────

export async function rejectQueueEntry(queueId: string, reason: string | null): Promise<QueueActionState> {
  const actor = await requireRole("super_admin", "admin", "consultant");
  const supabase = createAdminClient();

  const { data: entry } = await supabase
    .from("inbound_email_queue")
    .select("id, status")
    .eq("id", queueId)
    .maybeSingle();

  if (!entry) return { error: "Queue entry not found." };
  if ((entry.status as string) !== "pending") return { error: "This entry has already been resolved." };

  const trimmedReason = reason?.trim() || null;

  await supabase
    .from("inbound_email_queue")
    .update({
      status: "rejected",
      rejection_reason: trimmedReason,
      resolved_by: actor.id,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", queueId);

  await auditLog("email_queue.rejected", actor.id as string, actor.email as string, {
    metadata: { queue_id: queueId, reason: trimmedReason },
  });

  revalidatePath(QUEUE_ROUTE);
  return {};
}

// ── Reassign pickers ─────────────────────────────────────────────────────────

export interface ProjectSearchResult {
  id: string;
  label: string;
}

export async function searchProjectsForReassign(query: string): Promise<ProjectSearchResult[]> {
  await requireRole("super_admin", "admin", "consultant");
  const supabase = createAdminClient();

  let q = supabase
    .from("projects")
    .select("id, project_number, po_number, site_address, clients(name)")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(15);

  const trimmed = query.trim();
  if (trimmed) {
    const escaped = trimmed.replace(/[%,]/g, "");
    q = q.or(
      `site_address.ilike.%${escaped}%,po_number.ilike.%${escaped}%,project_number.ilike.%${escaped}%`
    );
  }

  const { data } = await q;

  return (data ?? []).map((p) => {
    const client = p.clients as unknown as { name: string } | null;
    const label =
      [p.project_number as string | null, p.site_address as string | null, client?.name]
        .filter(Boolean)
        .join(" · ") || (p.id as string).slice(0, 8);
    return { id: p.id as string, label };
  });
}

export interface ReviewCycleOption {
  id: string;
  label: string;
}

export async function getReviewCyclesForProject(projectId: string): Promise<ReviewCycleOption[]> {
  await requireRole("super_admin", "admin", "consultant");
  if (!projectId) return [];
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("stakeholder_reviews")
    .select("id, review_cycle, stakeholder_name, stakeholder_email")
    .eq("project_id", projectId)
    .order("review_cycle", { ascending: false })
    .order("dispatched_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: `Cycle ${r.review_cycle} — ${r.stakeholder_name} (${r.stakeholder_email})`,
  }));
}
