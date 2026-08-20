import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Chunked milestones for the single-request pipelines that write
// projects.progress_pct (PBDB generation, PBDR conversion, PBDR preview
// generation) — real pipeline boundaries, not smoothed/interpolated.
export const PROGRESS_MILESTONES = [20, 40, 70, 90, 100] as const;

/**
 * Writes a progress_pct value for a project. Fire-and-forget by design (best
 * effort — a failed progress write should never fail the underlying
 * pipeline), so callers should not await-block their critical path on this
 * beyond the normal await; errors are swallowed.
 */
export async function writeProgress(
  supabase: SupabaseClient,
  projectId: string,
  pct: number | null
): Promise<void> {
  await supabase
    .from("projects")
    .update({ progress_pct: pct })
    .eq("id", projectId)
    .then(
      () => {},
      (err: unknown) => console.error(`[progress] failed to write progress for ${projectId}:`, err)
    );
}
