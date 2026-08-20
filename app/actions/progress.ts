"use server";

import { requireRole } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ProjectProgress {
  progressPct: number | null;
}

/**
 * Lightweight poll target for projects.progress_pct — written by
 * generatePbdb, deliverPbdr, and buildPbdrPreview at real pipeline
 * boundaries (see lib/documents/progress.ts). The triggering button/UI polls
 * this while its own server action is pending, since the mutating action's
 * own request/response can't stream intermediate state.
 */
export async function getProjectProgress(projectId: string): Promise<ProjectProgress> {
  await requireRole("consultant", "super_admin", "admin");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("projects")
    .select("progress_pct")
    .eq("id", projectId)
    .maybeSingle();

  return { progressPct: (data?.progress_pct as number | null) ?? null };
}
