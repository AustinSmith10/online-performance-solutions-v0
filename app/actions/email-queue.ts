"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit/log";
import { sendEmail } from "@/lib/email/sender";
import { buildStakeholderReplyTo } from "@/lib/email/parser";
import { generateTokenString } from "@/lib/stakeholders/tokens";
import { getCandidateReviewsForSender, type CandidateReview } from "@/lib/email-queue/candidate-reviews";
import { renderClarificationRequestEmail } from "@/lib/email/templates/ClarificationRequestEmail";
import {
  executeQueueRowResolution,
  type QueueAttachmentRef,
  type QueueRowForExecution,
  type ResolvedTarget,
} from "@/lib/email/execute-resolution";

const CLARIFICATION_TOKEN_VALID_DAYS = 30;

// pending: untouched. awaiting_clarification: a request went out and the
// sender hasn't replied yet — still resolvable directly if the admin already
// knows the answer. Only approved/rejected are actually final.
const RESOLVABLE_STATUSES = ["pending", "awaiting_clarification"];

// The queue now lives inside each role's own shell (#101's nav-badge follow-up) —
// revalidate both so whichever one the acting admin/consultant is on refreshes.
const QUEUE_ROUTES = ["/admin/email-queue", "/ops/email-queue"];

function revalidateQueueRoutes() {
  for (const route of QUEUE_ROUTES) revalidatePath(route);
}

export interface QueueActionState {
  error?: string;
  // Set when approving created a brand-new project with at least one
  // AI-suggested (unconfirmed) document type — the caller should send the
  // admin/consultant straight there to confirm it, rather than leaving that
  // as an easy-to-miss badge back on the project page (#101 follow-up).
  redirectTo?: string;
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

// A brand-new project (new_submission only — an existing draft's documents
// were presumably already reviewed on an earlier pass) may have landed with
// AI-suggested, unconfirmed document types. If so, send the actor straight
// to it instead of leaving that as an easy-to-miss badge on a page they
// have no reason to visit next.
async function documentReviewRedirect(
  supabase: ReturnType<typeof createAdminClient>,
  target: ResolvedTarget,
  projectId: string | undefined,
  actorRole: string
): Promise<string | undefined> {
  if (target.category !== "new_submission" || !projectId) return undefined;

  const { count } = await supabase
    .from("project_files")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("file_type_confirmed", false);

  if (!count) return undefined;

  const base = actorRole === "consultant" ? `/ops/projects/${projectId}` : `/admin/projects/${projectId}`;
  return `${base}?queue_approved=1`;
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
  if (!RESOLVABLE_STATUSES.includes((entry as QueueDbRow).status)) return { error: "This entry has already been resolved." };

  const target = proposedTarget(entry as QueueDbRow);
  if (!target) return { error: "This entry has no proposed target — use Reassign instead." };

  const row = toExecutionRow(entry as QueueDbRow);
  const result = await executeQueueRowResolution(row, target, supabase);
  if (!result.ok) return { error: result.error ?? "Failed to process this entry." };

  await markResolved(supabase, queueId, target, result.projectId, actor.id as string);

  await auditLog("email_queue.approved", actor.id as string, actor.email as string, {
    metadata: { queue_id: queueId, category: target.category },
  });

  const redirectTo = await documentReviewRedirect(supabase, target, result.projectId, actor.role as string);

  revalidateQueueRoutes();
  return { redirectTo };
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
  if (!RESOLVABLE_STATUSES.includes((entry as QueueDbRow).status)) return { error: "This entry has already been resolved." };

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

  const redirectTo = await documentReviewRedirect(supabase, target, result.projectId, actor.role as string);

  revalidateQueueRoutes();
  return { redirectTo };
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
  if (!RESOLVABLE_STATUSES.includes(entry.status as string)) return { error: "This entry has already been resolved." };

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

  revalidateQueueRoutes();
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

// ── Clarification (stakeholder_table_fallback entries with no project link) ──

export async function getSuggestedReviewsForSender(queueId: string): Promise<CandidateReview[]> {
  await requireRole("super_admin", "admin", "consultant");
  const supabase = createAdminClient();

  const { data: entry } = await supabase
    .from("inbound_email_queue")
    .select("from_email")
    .eq("id", queueId)
    .maybeSingle();

  if (!entry) return [];
  return getCandidateReviewsForSender(supabase, entry.from_email as string);
}

export async function requestClarification(queueId: string, message: string): Promise<QueueActionState> {
  const actor = await requireRole("super_admin", "admin", "consultant");
  const trimmedMessage = message.trim();
  if (!trimmedMessage) return { error: "Write a message before sending." };

  const supabase = createAdminClient();

  const { data: entry } = await supabase
    .from("inbound_email_queue")
    .select("id, status, from_email")
    .eq("id", queueId)
    .maybeSingle();

  if (!entry) return { error: "Queue entry not found." };
  if (!RESOLVABLE_STATUSES.includes(entry.status as string)) return { error: "This entry has already been resolved." };

  const fromEmail = entry.from_email as string;
  // Still snapshotted for the admin-facing "asked to choose between" context
  // even though the sender never sees this list verbatim anymore — the
  // email itself is whatever the admin wrote.
  const candidates = await getCandidateReviewsForSender(supabase, fromEmail);

  const token = generateTokenString();
  const expiresAt = new Date(Date.now() + CLARIFICATION_TOKEN_VALID_DAYS * 24 * 60 * 60 * 1000);
  const replyTo = buildStakeholderReplyTo(token);

  const html = renderClarificationRequestEmail({ message: trimmedMessage });

  await sendEmail({
    to: fromEmail,
    subject: "OPS: Which project is this regarding?",
    html,
    source: "email_queue_clarification_request",
    ...(replyTo ? { replyTo } : {}),
  });

  await supabase
    .from("inbound_email_queue")
    .update({
      status: "awaiting_clarification",
      clarification_token: token,
      clarification_expires_at: expiresAt.toISOString(),
      clarification_requested_at: new Date().toISOString(),
      clarification_requested_by: actor.id,
      clarification_candidates: candidates,
      clarification_message: trimmedMessage,
    })
    .eq("id", queueId);

  await auditLog("email_queue.clarification_requested", actor.id as string, actor.email as string, {
    metadata: { queue_id: queueId, candidate_count: candidates.length },
  });

  revalidateQueueRoutes();
  return {};
}
