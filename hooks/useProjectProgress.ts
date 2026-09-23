"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { stepProgressPoll, type ProgressPollState } from "@/lib/documents/progress-poll";

const POLL_MS = 400;

export interface ProjectProgress {
  /** Current progress_pct, or null when nothing is in flight. */
  pct: number | null;
  /** progress_pct hasn't changed for PROGRESS_STALL_MS — show a manual Refresh instead of a spinner. */
  stalled: boolean;
  /** Manual Refresh for the stalled state: re-renders server data and restarts the stall clock. */
  refresh: () => void;
}

/**
 * Polls projects.progress_pct for a heavy document operation (PBDB
 * generation, PBDR conversion / preview) via GET
 * /api/projects/[id]/progress — a plain fetch, not a server action, since
 * the client serialises server actions and a poll action queued behind the
 * triggering mutation never saw progress clear (#184).
 *
 * `active` is typically a server action's `pending` flag. Since #172 the
 * generation work runs in the worker, so the action returns almost
 * immediately while `progress_pct` is still climbing — the hook keeps
 * polling after `active` goes false ("sticky"), for as long as the server
 * still reports a non-null value, and stops once the worker clears it to
 * null (completion or failure). On that non-null → null transition it calls
 * router.refresh() once so the file list / Focus card advance without
 * waiting on realtime. A stale % is masked to null whenever nothing is in
 * flight so it never flashes before the next run's first poll.
 */
export function useProjectProgress(projectId: string, active: boolean): ProjectProgress {
  const router = useRouter();
  const [pct, setPct] = useState<number | null>(null);
  const [stalled, setStalled] = useState(false);
  // Set true by a poll that sees an in-flight value; keeps the poll loop
  // alive after `active` drops. Cleared by a poll that sees null.
  const [sticky, setSticky] = useState(false);
  const pollState = useRef<ProgressPollState | null>(null);
  const polling = active || sticky;

  useEffect(() => {
    if (!polling) {
      pollState.current = null;
      return;
    }
    let cancelled = false;
    let inFlight = false;

    async function poll() {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/projects/${projectId}/progress`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { progressPct } = (await res.json()) as { progressPct: number | null };
        if (cancelled) return;
        const step = stepProgressPoll(pollState.current, progressPct, Date.now());
        pollState.current = step.state;
        setPct(progressPct);
        setStalled(step.stalled);
        setSticky(progressPct !== null);
        if (step.completed) router.refresh();
      } catch (err) {
        console.error("[useProjectProgress] poll failed:", err);
      } finally {
        inFlight = false;
      }
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [projectId, polling, router]);

  const refresh = useCallback(() => {
    if (pollState.current) pollState.current = { ...pollState.current, changedAt: Date.now() };
    setStalled(false);
    router.refresh();
  }, [router]);

  return { pct: polling ? pct : null, stalled: polling && stalled, refresh };
}
