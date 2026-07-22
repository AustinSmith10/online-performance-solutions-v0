import type { SupabaseClient } from "@supabase/supabase-js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface PurgeRejectedInboundAttachmentsResult {
  purgedCount: number;
  failedQueueIds: string[];
}

/**
 * Deletes storage objects for rejected inbound_email_queue entries past the
 * retention window. The queue row and its metadata are never touched — only
 * the `pending-inbound` attachment files, mirroring purge-recovery-bin's
 * storage-then-row split but stopping before any row mutation (see #102).
 */
export async function purgeRejectedInboundAttachments(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  now: Date = new Date()
): Promise<PurgeRejectedInboundAttachmentsResult> {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();

  const { data: entries, error } = await supabase
    .from("inbound_email_queue")
    .select("id, attachment_paths")
    .eq("status", "rejected")
    .lt("resolved_at", cutoff);

  if (error) {
    throw new Error(error.message);
  }

  let purgedCount = 0;
  const failedQueueIds: string[] = [];

  for (const entry of entries ?? []) {
    const queueId = entry.id as string;
    const attachments = (entry.attachment_paths as { path: string }[] | null) ?? [];

    if (attachments.length === 0) continue;

    try {
      const paths = attachments.map((attachment) => attachment.path);
      const { error: removeError } = await supabase.storage.from("pending-inbound").remove(paths);
      if (removeError) throw new Error(removeError.message);

      purgedCount += 1;
    } catch (err) {
      console.error(`[purge-rejected-inbound-attachments] failed to purge queue entry ${queueId}:`, err);
      failedQueueIds.push(queueId);
    }
  }

  return { purgedCount, failedQueueIds };
}
