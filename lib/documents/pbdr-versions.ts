import type { ActiveVersion, HistoricalVersion, VersionEntry } from "@/lib/documents/pbdb-versions";

// Same Active / Historical language as the PBDB grouping (#198), for PBDR
// files (#199). A PBDR is one file per conversion (`approved_conversion`), so
// unlike PBDB it can't pile up same-cycle duplicates and has no "earlier
// drafts" tier. A delivered PBDR that gets reverted to the PBDB QA cycle
// reads the way a rejected PBDB revision does: it moves to Historical until a
// new conversion replaces it.

export interface PbdrFileRow {
  id: string;
  original_filename: string;
  version: number;
  created_at: string;
}

export interface PbdrRevisionRow {
  doc_type: string;
  event: string;
  rev_number: number;
  created_at: string;
}

export interface PbdrVersionGrouping {
  /** null while the delivered PBDR is reverted and awaiting a new conversion. */
  active: ActiveVersion | null;
  historical: HistoricalVersion[];
}

export function groupPbdrVersions(input: {
  files: PbdrFileRow[];
  revisionHistory: PbdrRevisionRow[];
}): PbdrVersionGrouping | null {
  const files = [...input.files].sort((a, b) => a.version - b.version);
  if (files.length === 0) return null;

  // One PBDR file per conversion, in order — the Nth file is the Nth
  // conversion's Rev. Falls back to its position if the rows ever disagree.
  const conversionRevs = input.revisionHistory
    .filter((r) => r.doc_type === "pbdr" && r.event === "approved_conversion")
    .sort((a, b) => a.rev_number - b.rev_number)
    .map((r) => r.rev_number);
  // A revert is recorded against the PBDB history (it bumps the PBDB rev).
  const revertedAt = input.revisionHistory.filter((r) => r.event === "reverted").map((r) => r.created_at);

  const entryFor = (f: PbdrFileRow, index: number): VersionEntry => ({
    fileId: f.id,
    originalFilename: f.original_filename,
    createdAt: f.created_at,
    revNumber: conversionRevs[index] ?? index,
    reviewCycle: null,
    revisionNote: null,
  });

  const wasRevertedBeforeNext = (index: number) => {
    const start = files[index].created_at;
    const end = files[index + 1]?.created_at ?? null;
    return revertedAt.some((t) => t > start && (end === null || t <= end));
  };

  const historical: HistoricalVersion[] = [];
  let active: ActiveVersion | null = null;
  files.forEach((f, i) => {
    const isLatest = i === files.length - 1;
    const reverted = wasRevertedBeforeNext(i);
    if (isLatest && !reverted) {
      active = { ...entryFor(f, i), badge: "none", ctaCopy: null };
      return;
    }
    historical.push({
      ...entryFor(f, i),
      outcome: reverted ? "reverted" : "replaced",
      rejectedBy: { names: [], count: 0 },
    });
  });

  return { active, historical: historical.reverse() };
}
