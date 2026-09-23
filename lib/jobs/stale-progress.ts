import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How long progress_pct may sit unchanged with no generate-pbdb job queued or
 * active before the sweep treats the operation as dead. Every heavy pipeline
 * finishes well inside this (generation < 1 min on prod) and writes a new
 * milestone far more often than this.
 */
export const STALE_PROGRESS_MS = 5 * 60_000;

/** Last-seen progress per project, kept in worker memory between sweeps. */
export type ProgressTracker = Map<string, { pct: number; since: number }>;

export interface HeavyJobLookup {
  /** A generate-pbdb job for this project is still queued/active. */
  inFlight: boolean;
  /** Who triggered the most recent generate-pbdb job, if there was one. */
  actorId: string | null;
}

export interface ClearedProgress {
  projectId: string;
  pct: number;
  actorId: string | null;
}

/**
 * Clears progress_pct left behind by a heavy document job that died mid-run
 * (#184) — worker crash/redeploy, pg-boss expiry, or a web process restart
 * during an inline PBDR conversion/preview. Those paths never reach their own
 * `writeProgress(null)`, so without this the Generate/Convert buttons would
 * spin (and the per-project lock stay engaged) forever.
 *
 * A value is stale once it has been seen unchanged across sweeps for
 * STALE_PROGRESS_MS and no generate-pbdb job is queued or active for the
 * project. The clear is conditional on the value still being the one we
 * saw, so a pipeline that advanced in the meantime is never clobbered.
 * Returns what was cleared so the caller can record the failure.
 */
export async function clearStaleProgress(
  supabase: SupabaseClient,
  tracker: ProgressTracker,
  lookupJob: (projectId: string) => Promise<HeavyJobLookup>,
  now: number = Date.now()
): Promise<ClearedProgress[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("id, progress_pct")
    .not("progress_pct", "is", null);
  if (error) throw new Error(`stale-progress query failed: ${error.message}`);

  const seen = new Set<string>();
  const cleared: ClearedProgress[] = [];

  for (const row of data ?? []) {
    const projectId = row.id as string;
    const pct = row.progress_pct as number;
    seen.add(projectId);

    const prev = tracker.get(projectId);
    if (!prev || prev.pct !== pct) {
      tracker.set(projectId, { pct, since: now });
      continue;
    }
    if (now - prev.since < STALE_PROGRESS_MS) continue;

    const job = await lookupJob(projectId);
    if (job.inFlight) continue;

    const { error: clearErr } = await supabase
      .from("projects")
      .update({ progress_pct: null })
      .eq("id", projectId)
      .eq("progress_pct", pct);
    if (clearErr) {
      console.error(`[stale-progress] failed to clear ${projectId}:`, clearErr);
      continue;
    }
    tracker.delete(projectId);
    cleared.push({ projectId, pct, actorId: job.actorId });
  }

  for (const projectId of tracker.keys()) {
    if (!seen.has(projectId)) tracker.delete(projectId);
  }

  return cleared;
}
