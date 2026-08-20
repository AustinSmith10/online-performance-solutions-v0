"use client";

import { useEffect, useState } from "react";
import { getProjectProgress } from "@/app/actions/progress";

const POLL_MS = 400;

/**
 * Polls projects.progress_pct while `active` (typically a server action's
 * `pending` flag). See app/actions/progress.ts and lib/documents/progress.ts
 * for why this is DB-column polling rather than a stream read — these are
 * single-request server actions with no other channel to a separate poll
 * request.
 *
 * The last-polled value is masked to null whenever inactive (rather than
 * reset via a synchronous setState in the effect) so a stale % never
 * flashes before the next active run's first poll lands.
 */
export function useProjectProgress(projectId: string, active: boolean): number | null {
  const [pct, setPct] = useState<number | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function poll() {
      try {
        const { progressPct } = await getProjectProgress(projectId);
        if (!cancelled) setPct(progressPct);
      } catch (err) {
        console.error("[useProjectProgress] poll failed:", err);
      }
    }
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectId, active]);

  return active ? pct : null;
}
