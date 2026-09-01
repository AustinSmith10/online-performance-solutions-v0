import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Chunked milestones for the single-request pipelines that write
// projects.progress_pct (PBDB generation, PBDR conversion, PBDR preview
// generation) — real pipeline boundaries, not smoothed/interpolated.
export const PROGRESS_MILESTONES = [20, 40, 70, 90, 100] as const;

/**
 * Writes a progress_pct value for a project. Best-effort by design — a failed
 * progress write must never fail the underlying pipeline — so this never
 * throws. But it does now inspect the PostgREST `.error` (which comes back in
 * the resolved value, not as a rejection) and log it, rather than swallowing
 * it silently: an unchecked `.error` here was part of the #166 pattern.
 */
export async function writeProgress(
  supabase: SupabaseClient,
  projectId: string,
  pct: number | null
): Promise<void> {
  try {
    const { error } = await supabase
      .from("projects")
      .update({ progress_pct: pct })
      .eq("id", projectId);
    if (error) {
      console.error(`[progress] failed to write progress for ${projectId}:`, error);
    }
  } catch (err) {
    console.error(`[progress] failed to write progress for ${projectId}:`, err);
  }
}
