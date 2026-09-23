import { REJECTED_STATUSES, deriveRoundStatus } from "@/lib/stakeholders/round-status";

// project_files never supersedes an old version — every Regenerate click and
// every re-upload appends a row. This groups a project's PBDB rows into the
// three tiers a reader actually needs (#198):
//
//   active      the current working/dispatched file
//   historical  one entry per past cycle that was actually dispatched
//   drafts      same-cycle versions before the cycle's last one — pre-dispatch
//               regenerate noise with no audit value (nothing was reviewed
//               against them), hidden but never deleted
//
// Regeneration is only possible pre-dispatch and any post-dispatch new file
// opens a new review cycle, so same-cycle duplicates are always draft noise
// while across-cycle differences are always real, reviewed history.

export const DRAFT_CTA_COPY = "Download the new working PBDB, make corrections, upload";

export interface PbdbFileRow {
  id: string;
  original_filename: string;
  version: number;
  review_cycle: number;
  created_at: string;
}

export interface PbdbReviewRow {
  review_cycle: number;
  status: string;
  round_status: string;
  stakeholder_name: string;
}

export interface PbdbRevisionRow {
  event: string;
  rev_number: number;
  review_cycle: number | null;
  created_at: string;
}

export interface VersionEntry {
  fileId: string;
  originalFilename: string;
  createdAt: string;
  revNumber: number;
  /** null for PBDR, which has no review cycle of its own. */
  reviewCycle: number | null;
  revisionNote: string | null;
}

export interface ActiveVersion extends VersionEntry {
  /**
   * none       nothing has been sent yet and nothing has been rejected
   * dispatched this file is the one sent to stakeholders
   * draft      a working copy replacing a rejected/reverted revision — either
   *            the same file about to be corrected (served pre-labeled with the
   *            new rev by the #194 download patch) or the corrected upload
   *            awaiting redispatch
   */
  badge: "none" | "dispatched" | "draft";
  ctaCopy: string | null;
}

export type HistoricalOutcome = "rejected" | "reverted" | "replaced";

export interface HistoricalVersion extends VersionEntry {
  outcome: HistoricalOutcome;
  rejectedBy: { names: string[]; count: number };
}

export interface PbdbVersionGrouping {
  active: ActiveVersion;
  historical: HistoricalVersion[];
  drafts: VersionEntry[];
}

const MAX_INLINE_NAMES = 3;

/** "rejected by A, B and C" up to three names, "rejected by 4 stakeholders" beyond that. */
export function rejectedByLabel(rejectedBy: { names: string[]; count: number }): string | null {
  if (rejectedBy.count === 0) return null;
  if (rejectedBy.count > MAX_INLINE_NAMES) return `rejected by ${rejectedBy.count} stakeholders`;
  const { names } = rejectedBy;
  if (names.length === 1) return `rejected by ${names[0]}`;
  return `rejected by ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function groupPbdbVersions(input: {
  files: PbdbFileRow[];
  reviews: PbdbReviewRow[];
  revisionHistory: PbdbRevisionRow[];
  revisionNotesByCycle: Map<number, string>;
}): PbdbVersionGrouping | null {
  const files = [...input.files].sort((a, b) => a.version - b.version);
  if (files.length === 0) return null;

  const filesByCycle = new Map<number, PbdbFileRow[]>();
  for (const f of files) {
    if (!filesByCycle.has(f.review_cycle)) filesByCycle.set(f.review_cycle, []);
    filesByCycle.get(f.review_cycle)!.push(f);
  }
  const cycles = [...filesByCycle.keys()].sort((a, b) => a - b);
  const latestCycle = cycles[cycles.length - 1];
  const lastFileOf = (cycle: number) => {
    const group = filesByCycle.get(cycle)!;
    return group[group.length - 1];
  };
  const latestFile = lastFileOf(latestCycle);

  const reviewsByCycle = new Map<number, PbdbReviewRow[]>();
  for (const r of input.reviews) {
    if (!reviewsByCycle.has(r.review_cycle)) reviewsByCycle.set(r.review_cycle, []);
    reviewsByCycle.get(r.review_cycle)!.push(r);
  }
  const wasDispatched = (cycle: number) => (reviewsByCycle.get(cycle)?.length ?? 0) > 0;
  const rejectersOf = (cycle: number) => [
    ...new Set(
      (reviewsByCycle.get(cycle) ?? [])
        .filter((r) => REJECTED_STATUSES.has(r.status))
        .map((r) => r.stakeholder_name)
    ),
  ];

  const revisions = input.revisionHistory;
  const rejectedRows = revisions.filter((r) => r.event === "rejected" && r.review_cycle != null);
  const revertedRows = revisions.filter((r) => r.event === "reverted");
  const currentRev = Math.max(0, ...revisions.map((r) => r.rev_number));

  // A file's rev is whatever the last bump before it was: a rejection of an
  // earlier cycle (matched by cycle — exact), or a revert that happened before
  // it was uploaded (matched by time — a revert precedes the corrected upload
  // by human-scale time, unlike a forced close that races the upload itself).
  const revOfFile = (f: PbdbFileRow) =>
    Math.max(
      0,
      ...rejectedRows.filter((r) => (r.review_cycle as number) < f.review_cycle).map((r) => r.rev_number),
      ...revertedRows.filter((r) => r.created_at <= f.created_at).map((r) => r.rev_number)
    );

  const nextCycleStart = (cycle: number) => {
    const next = cycles.find((c) => c > cycle);
    return next === undefined ? null : filesByCycle.get(next)![0].created_at;
  };
  const outcomeOf = (cycle: number): HistoricalOutcome => {
    const file = lastFileOf(cycle);
    const end = nextCycleStart(cycle);
    const revertedAfter = revertedRows.some(
      (r) => r.created_at > file.created_at && (end === null || r.created_at <= end)
    );
    if (revertedAfter) return "reverted";
    if (rejectersOf(cycle).length > 0) return "rejected";
    return "replaced";
  };

  const entryFor = (f: PbdbFileRow, revNumber: number): VersionEntry => ({
    fileId: f.id,
    originalFilename: f.original_filename,
    createdAt: f.created_at,
    revNumber,
    reviewCycle: f.review_cycle,
    revisionNote: input.revisionNotesByCycle.get(f.review_cycle) ?? null,
  });

  // The latest file is already a superseded revision — its round closed
  // rejected, or it was delivered and then reverted — and nothing newer has
  // been uploaded. The same file is then both the Historical record of what
  // was reviewed and the working copy to correct (served pre-labeled with the
  // bumped rev), so it appears in both tiers.
  const latestRoundClosedRejected = deriveRoundStatus(reviewsByCycle.get(latestCycle) ?? []) === "closed_rejected";
  const latestRevertedSince = revertedRows.some((r) => r.created_at > latestFile.created_at);
  const latestIsSuperseded = wasDispatched(latestCycle) && (latestRoundClosedRejected || latestRevertedSince);

  const historicalCycles = cycles.filter(
    (c) => wasDispatched(c) && (c !== latestCycle || latestIsSuperseded)
  );
  const historical: HistoricalVersion[] = historicalCycles
    .map((c) => {
      const names = rejectersOf(c);
      return {
        ...entryFor(lastFileOf(c), revOfFile(lastFileOf(c))),
        outcome: outcomeOf(c),
        rejectedBy: { names, count: names.length },
      };
    })
    .reverse();

  let active: ActiveVersion;
  if (latestIsSuperseded) {
    active = { ...entryFor(latestFile, currentRev), badge: "draft", ctaCopy: DRAFT_CTA_COPY };
  } else {
    const previousDispatched = [...cycles].reverse().find((c) => c < latestCycle && wasDispatched(c));
    const previousOutcome = previousDispatched === undefined ? null : outcomeOf(previousDispatched);
    const badge: ActiveVersion["badge"] = wasDispatched(latestCycle)
      ? "dispatched"
      : previousOutcome === "rejected" || previousOutcome === "reverted"
      ? "draft"
      : "none";
    active = { ...entryFor(latestFile, revOfFile(latestFile)), badge, ctaCopy: null };
  }

  const shown = new Set([active.fileId, ...historical.map((h) => h.fileId)]);
  const drafts = files
    .filter((f) => !shown.has(f.id))
    .map((f) => entryFor(f, revOfFile(f)))
    .reverse();

  return { active, historical, drafts };
}
