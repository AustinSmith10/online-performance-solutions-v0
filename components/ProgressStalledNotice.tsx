/**
 * Replaces a progress spinner/bar once progress_pct hasn't moved for
 * PROGRESS_STALL_MS (#184), so a stuck job reads as stuck rather than
 * spinning forever. `onRefresh` is useProjectProgress's `refresh`.
 */
export function ProgressStalledNotice({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800">
      <p>This is taking longer than expected.</p>
      <button
        type="button"
        onClick={onRefresh}
        className="mt-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 transition-colors duration-150 hover:bg-amber-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700"
      >
        Refresh
      </button>
    </div>
  );
}
