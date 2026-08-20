// Pure state-transition helpers for "Download all" (#129) — kept
// independent of React/DOM so the sequencing logic is unit-testable without
// a browser environment (this repo has no jsdom/RTL setup).

export type RowStatus = "idle" | "downloading" | "done";

/** What a given row should show, given which index is currently downloading and which ids have finished. */
export function rowStatus(index: number, activeIndex: number | null, completedIds: ReadonlySet<string>, id: string): RowStatus {
  if (completedIds.has(id)) return "done";
  if (index === activeIndex) return "downloading";
  return "idle";
}

/** The next index to download after `completedIndex` finishes, or null once every item is done. */
export function nextIndex(completedIndex: number, total: number): number | null {
  const next = completedIndex + 1;
  return next < total ? next : null;
}
