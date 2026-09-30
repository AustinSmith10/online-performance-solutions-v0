import type { SupabaseClient } from "@supabase/supabase-js";
import { notify } from "@/lib/notifications/notify";

// A clarification request goes out when an email can't be matched to a project
// or review, and the queue row then waits for the sender to reply. Nothing
// else chases it, so a sender who never answers leaves the row sitting in
// "Awaiting reply" indefinitely. This nudges staff at each stage, once.
export const REMINDER_STAGES = [
  { stage: 1, afterDays: 3 },
  { stage: 2, afterDays: 7 },
] as const;

const REMINDER_EVENT = "email_queue.clarification_reminder";
const DAY_MS = 86_400_000;

export interface ClarificationReminderResult {
  reminded: number;
  failedQueueIds: string[];
}

// Idempotence lives in audit_log (an immutable record, no schema change): a
// stage is written before anyone is notified, so a failed notification never
// causes a repeat, and a failed write causes a retry on the next run instead.
export async function sendClarificationReminders(
  supabase: SupabaseClient,
  now: Date = new Date()
): Promise<ClarificationReminderResult> {
  const { data: rows, error } = await supabase
    .from("inbound_email_queue")
    .select("id, from_email, from_name, subject, clarification_requested_at, clarification_expires_at, clarification_requested_by")
    .eq("status", "awaiting_clarification")
    .not("clarification_requested_at", "is", null);

  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return { reminded: 0, failedQueueIds: [] };

  const due = rows
    .map((r) => {
      const ageDays = (now.getTime() - new Date(r.clarification_requested_at as string).getTime()) / DAY_MS;
      const stage = [...REMINDER_STAGES].reverse().find((s) => ageDays >= s.afterDays);
      return stage ? { row: r, stage: stage.stage, ageDays: Math.floor(ageDays) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (due.length === 0) return { reminded: 0, failedQueueIds: [] };

  const { data: sent, error: sentError } = await supabase
    .from("audit_log")
    .select("metadata")
    .eq("event_type", REMINDER_EVENT)
    .in("metadata->>queue_id", due.map((d) => d.row.id as string));
  if (sentError) throw new Error(sentError.message);
  const already = new Set(
    (sent ?? []).map((s) => {
      const m = s.metadata as { queue_id?: string; stage?: number } | null;
      return `${m?.queue_id}:${m?.stage}`;
    })
  );

  const { data: admins } = await supabase.from("users").select("id").in("role", ["super_admin", "admin"]);
  const adminIds = (admins ?? []).map((a) => a.id as string);

  let reminded = 0;
  const failedQueueIds: string[] = [];

  for (const { row, stage, ageDays } of due) {
    const queueId = row.id as string;
    if (already.has(`${queueId}:${stage}`)) continue;

    const { error: markError } = await supabase.from("audit_log").insert({
      event_type: REMINDER_EVENT,
      actor_id: null,
      actor_email: null,
      metadata: { queue_id: queueId, stage, age_days: ageDays },
    });
    if (markError) {
      failedQueueIds.push(queueId);
      continue;
    }

    const who = (row.from_name as string | null) || (row.from_email as string);
    const expired = row.clarification_expires_at
      ? new Date(row.clarification_expires_at as string) < now
      : false;
    const message =
      `${who} hasn't replied to your clarification request${row.subject ? ` about "${row.subject}"` : ""}` +
      ` (${ageDays} days).` +
      (expired ? " Their reply link has expired." : "") +
      " Follow up with them, or resolve or reject it in the Email Queue.";

    // The person who asked plus every admin, once each.
    const recipients = new Set(adminIds);
    if (row.clarification_requested_by) recipients.add(row.clarification_requested_by as string);

    await Promise.all(
      [...recipients].map((recipientId) =>
        notify({ recipientId, type: "email_queue_clarification_unanswered", message, inAppOnly: true }).catch(() => {})
      )
    );
    reminded += 1;
  }

  return { reminded, failedQueueIds };
}
