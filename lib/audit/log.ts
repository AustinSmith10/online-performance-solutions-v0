import { createAdminClient } from "@/lib/supabase/admin";

export interface AuditOptions {
  projectId?: string;
  orgId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Writes an immutable audit log entry. Non-throwing — failures are logged to
 * console only so that a logging error never breaks the calling operation.
 */
export async function auditLog(
  eventType: string,
  actorId: string | null,
  actorEmail: string | null,
  options?: AuditOptions
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("audit_log").insert({
      event_type: eventType,
      actor_id: actorId ?? null,
      actor_email: actorEmail ?? null,
      project_id: options?.projectId ?? null,
      client_id: options?.orgId ?? null,
      metadata: options?.metadata ?? null,
    });
  } catch (err) {
    console.error("[audit] failed to write log entry:", err);
  }
}
