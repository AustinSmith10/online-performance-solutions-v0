/**
 * Pure state transitions for hooks/useProjectProgress.ts, split out so the
 * completion / stall rules are unit-testable without a React harness.
 */

/** No change in progress_pct for this long → show "taking longer than expected" (#184). */
export const PROGRESS_STALL_MS = 90_000;

export interface ProgressPollState {
  /** Last value the poll observed. */
  value: number | null;
  /** When `value` last changed (ms epoch). */
  changedAt: number;
}

export interface ProgressPollStep {
  state: ProgressPollState;
  /** True exactly once, on the poll that sees an in-flight value go back to null. */
  completed: boolean;
  stalled: boolean;
}

export function stepProgressPoll(
  prev: ProgressPollState | null,
  value: number | null,
  now: number
): ProgressPollStep {
  const changed = !prev || prev.value !== value;
  const state = changed ? { value, changedAt: now } : prev;
  return {
    state,
    completed: prev !== null && prev.value !== null && value === null,
    stalled: now - state.changedAt >= PROGRESS_STALL_MS,
  };
}
