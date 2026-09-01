"use client";

import { useEffect, useState } from "react";
import { getProjectProgress } from "@/app/actions/progress";

const POLL_MS = 400;

/**
 * Polls projects.progress_pct for a heavy document operation (PBDB
 * generation, PBDR conversion / preview). See app/actions/progress.ts and
 * lib/documents/progress.ts for why this is DB-column polling rather than a
 * stream read.
 *
 * `active` is typically a server action's `pending` flag. Since #172 the
 * generation work runs in the worker, so the action returns almost
 * immediately while `progress_pct` is still climbing — the hook keeps
 * polling after `active` goes false ("sticky"), for as long as the server
 * still reports a non-null value, and stops once the worker clears it to
 * null (completion or failure). A stale % is masked to null whenever nothing
 * is in flight so it never flashes before the next run's first poll.
 */
export function useProjectProgress(projectId: string, active: boolean): number | null {
  const [pct, setPct] = useState<number | null>(null);
  // Set true by a poll that sees an in-flight value; keeps the poll loop
  // alive after `active` drops. Cleared by a poll that sees null.
  const [sticky, setSticky] = useState(false);

  useEffect(() => {
    if (!active && !sticky) return;
    let cancelled = false;

    async function poll() {
      try {
        const { progressPct } = await getProjectProgress(projectId);
        if (cancelled) return;
        setPct(progressPct);
        setSticky(progressPct !== null);
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
  }, [projectId, active, sticky]);

  return active || sticky ? pct : null;
}
