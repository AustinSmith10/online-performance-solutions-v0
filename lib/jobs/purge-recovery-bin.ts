import type { SupabaseClient } from "@supabase/supabase-js";
import { removeProjectStorageFiles } from "@/lib/storage/project-files";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export interface PurgeRecoveryBinResult {
  purgedCount: number;
  failedProjectIds: string[];
}

/**
 * Hard-deletes soft-deleted projects past the retention window: removes their
 * storage objects first, then purges the row via the `purge_project()` RPC
 * (which nulls credit_ledger.project_id and disables the audit_log
 * immutability trigger for the cascade). One project's failure doesn't stop
 * the rest of the batch.
 */
export async function purgeRecoveryBin(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  now: Date = new Date()
): Promise<PurgeRecoveryBinResult> {
  const cutoff = new Date(now.getTime() - THIRTY_DAYS_MS).toISOString();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id")
    .not("deleted_at", "is", null)
    .lt("deleted_at", cutoff);

  if (error) {
    throw new Error(error.message);
  }

  let purgedCount = 0;
  const failedProjectIds: string[] = [];

  for (const project of projects ?? []) {
    const projectId = project.id as string;
    try {
      await removeProjectStorageFiles(supabase, projectId);

      const { error: purgeError } = await supabase.rpc("purge_project", {
        p_project_id: projectId,
      });
      if (purgeError) throw new Error(purgeError.message);

      purgedCount += 1;
    } catch (err) {
      console.error(`[purge-recovery-bin] failed to purge project ${projectId}:`, err);
      failedProjectIds.push(projectId);
    }
  }

  return { purgedCount, failedProjectIds };
}
