import { describe, expect, it } from "vitest";
import {
  DRAFT_CTA_COPY,
  groupPbdbVersions,
  rejectedByLabel,
  type PbdbFileRow,
  type PbdbReviewRow,
  type PbdbRevisionRow,
} from "./pbdb-versions";

let seq = 0;
function file(version: number, cycle: number, isoDay: string): PbdbFileRow {
  seq += 1;
  return {
    id: `f${seq}`,
    original_filename: `pbdb-v${version}.docx`,
    version,
    review_cycle: cycle,
    created_at: `2026-09-${isoDay}T00:00:00Z`,
  };
}

function review(
  cycle: number,
  name: string,
  status: string,
  roundStatus: string
): PbdbReviewRow {
  return { review_cycle: cycle, status, round_status: roundStatus, stakeholder_name: name };
}

function rev(event: string, revNumber: number, cycle: number | null, isoDay: string): PbdbRevisionRow {
  return { event, rev_number: revNumber, review_cycle: cycle, created_at: `2026-09-${isoDay}T00:00:00Z` };
}

const initial = rev("initial", 0, null, "01");
const noNotes = new Map<number, string>();

describe("groupPbdbVersions", () => {
  it("returns null with no files", () => {
    expect(
      groupPbdbVersions({ files: [], reviews: [], revisionHistory: [], revisionNotesByCycle: noNotes })
    ).toBeNull();
  });

  it("single unsent file is Active with no badge", () => {
    const g = groupPbdbVersions({
      files: [file(1, 1, "02")],
      reviews: [],
      revisionHistory: [initial],
      revisionNotesByCycle: noNotes,
    })!;
    expect(g.active.badge).toBe("none");
    expect(g.active.revNumber).toBe(0);
    expect(g.active.ctaCopy).toBeNull();
    expect(g.historical).toEqual([]);
    expect(g.drafts).toEqual([]);
  });

  it("regenerating twice pre-dispatch shows only the latest and collapses the earlier drafts", () => {
    const f1 = file(1, 1, "02");
    const f2 = file(2, 1, "03");
    const f3 = file(3, 1, "04");
    const g = groupPbdbVersions({
      files: [f1, f2, f3],
      reviews: [],
      revisionHistory: [initial],
      revisionNotesByCycle: noNotes,
    })!;
    expect(g.active.fileId).toBe(f3.id);
    expect(g.drafts.map((d) => d.fileId)).toEqual([f2.id, f1.id]);
    expect(g.historical).toEqual([]);
  });

  it("a dispatched file is Active with the dispatched badge", () => {
    const g = groupPbdbVersions({
      files: [file(1, 1, "02")],
      reviews: [review(1, "Ann", "pending", "open")],
      revisionHistory: [initial],
      revisionNotesByCycle: noNotes,
    })!;
    expect(g.active.badge).toBe("dispatched");
    expect(g.historical).toEqual([]);
  });

  it("round closed rejected: rejected rev moves to Historical, same file is the Draft working copy at the bumped rev", () => {
    const f1 = file(1, 1, "02");
    const g = groupPbdbVersions({
      files: [f1],
      reviews: [
        review(1, "Ann", "rejected_with_comments", "closed_rejected"),
        review(1, "Bob", "approved_without_comments", "closed_rejected"),
      ],
      revisionHistory: [initial, rev("rejected", 1, 1, "05")],
      revisionNotesByCycle: noNotes,
    })!;

    expect(g.historical).toHaveLength(1);
    expect(g.historical[0]).toMatchObject({
      fileId: f1.id,
      revNumber: 0,
      outcome: "rejected",
      rejectedBy: { names: ["Ann"], count: 1 },
    });
    expect(g.active).toMatchObject({
      fileId: f1.id,
      revNumber: 1,
      badge: "draft",
      ctaCopy: DRAFT_CTA_COPY,
    });
    expect(g.drafts).toEqual([]);
  });

  it("someone rejected but the round is still open: nothing moves to Historical yet", () => {
    const g = groupPbdbVersions({
      files: [file(1, 1, "02")],
      reviews: [
        review(1, "Ann", "rejected_with_comments", "open"),
        review(1, "Bob", "pending", "open"),
      ],
      revisionHistory: [initial],
      revisionNotesByCycle: noNotes,
    })!;
    expect(g.historical).toEqual([]);
    expect(g.active.badge).toBe("dispatched");
  });

  it("corrected upload awaiting redispatch is Draft (no CTA); once dispatched it is Dispatched", () => {
    const f1 = file(1, 1, "02");
    const f2 = file(2, 2, "06");
    const rejectedRound = [review(1, "Ann", "rejected_with_comments", "closed_rejected")];
    const history = [initial, rev("rejected", 1, 1, "05")];

    const awaiting = groupPbdbVersions({
      files: [f1, f2],
      reviews: rejectedRound,
      revisionHistory: history,
      revisionNotesByCycle: new Map([[2, "Fixed the setbacks"]]),
    })!;
    expect(awaiting.active).toMatchObject({
      fileId: f2.id,
      revNumber: 1,
      badge: "draft",
      ctaCopy: null,
      revisionNote: "Fixed the setbacks",
    });
    expect(awaiting.historical.map((h) => h.fileId)).toEqual([f1.id]);
    expect(awaiting.historical[0].rejectedBy.names).toEqual(["Ann"]);

    const dispatched = groupPbdbVersions({
      files: [f1, f2],
      reviews: [...rejectedRound, review(2, "Ann", "pending", "open")],
      revisionHistory: history,
      revisionNotesByCycle: noNotes,
    })!;
    expect(dispatched.active).toMatchObject({ fileId: f2.id, revNumber: 1, badge: "dispatched" });
  });

  it("orders Historical newest first and keeps each cycle's own rev", () => {
    const f1 = file(1, 1, "02");
    const f2 = file(2, 2, "06");
    const f3 = file(3, 3, "10");
    const g = groupPbdbVersions({
      files: [f1, f2, f3],
      reviews: [
        review(1, "Ann", "rejected_with_comments", "closed_rejected"),
        review(2, "Bob", "rejected_without_comments", "closed_rejected"),
        review(3, "Ann", "pending", "open"),
      ],
      revisionHistory: [initial, rev("rejected", 1, 1, "05"), rev("rejected", 2, 2, "09")],
      revisionNotesByCycle: noNotes,
    })!;
    expect(g.historical.map((h) => [h.fileId, h.revNumber])).toEqual([
      [f2.id, 1],
      [f1.id, 0],
    ]);
    expect(g.active).toMatchObject({ fileId: f3.id, revNumber: 2, badge: "dispatched" });
  });

  it("collapses same-cycle drafts even when a later cycle exists", () => {
    const f1 = file(1, 1, "02");
    const f2 = file(2, 1, "03");
    const f3 = file(3, 2, "06");
    const g = groupPbdbVersions({
      files: [f1, f2, f3],
      reviews: [review(1, "Ann", "rejected_with_comments", "closed_rejected")],
      revisionHistory: [initial, rev("rejected", 1, 1, "05")],
      revisionNotesByCycle: noNotes,
    })!;
    expect(g.historical.map((h) => h.fileId)).toEqual([f2.id]);
    expect(g.drafts.map((d) => d.fileId)).toEqual([f1.id]);
    expect(g.active.fileId).toBe(f3.id);
  });

  it("a forced close with no rejection keeps the rev and marks the old cycle replaced", () => {
    const f1 = file(1, 1, "02");
    const f2 = file(2, 2, "06");
    const g = groupPbdbVersions({
      files: [f1, f2],
      reviews: [
        review(1, "Ann", "superseded", "superseded"),
        review(2, "Ann", "pending", "open"),
      ],
      revisionHistory: [initial],
      revisionNotesByCycle: noNotes,
    })!;
    expect(g.historical[0]).toMatchObject({ fileId: f1.id, outcome: "replaced", revNumber: 0 });
    expect(g.historical[0].rejectedBy.count).toBe(0);
    expect(g.active).toMatchObject({ fileId: f2.id, revNumber: 0, badge: "dispatched" });
  });

  it("delivered then reverted with no new upload: approved rev is Historical (reverted), same file is the Draft at the bumped rev", () => {
    const f1 = file(1, 1, "02");
    const g = groupPbdbVersions({
      files: [f1],
      reviews: [review(1, "Ann", "approved_without_comments", "closed_approved")],
      revisionHistory: [initial, rev("reverted", 1, null, "08")],
      revisionNotesByCycle: noNotes,
    })!;
    expect(g.historical[0]).toMatchObject({ fileId: f1.id, outcome: "reverted", revNumber: 0 });
    expect(g.active).toMatchObject({ fileId: f1.id, revNumber: 1, badge: "draft", ctaCopy: DRAFT_CTA_COPY });
  });

  it("a corrected upload after a revert carries the reverted rev", () => {
    const f1 = file(1, 1, "02");
    const f2 = file(2, 2, "10");
    const g = groupPbdbVersions({
      files: [f1, f2],
      reviews: [
        review(1, "Ann", "approved_without_comments", "closed_approved"),
        review(2, "Ann", "pending", "open"),
      ],
      revisionHistory: [initial, rev("reverted", 1, null, "08")],
      revisionNotesByCycle: noNotes,
    })!;
    expect(g.historical[0]).toMatchObject({ fileId: f1.id, outcome: "reverted" });
    expect(g.active).toMatchObject({ fileId: f2.id, revNumber: 1, badge: "dispatched" });
  });
});

describe("groupPbdbVersions with pre-#191 rejection rows (no review_cycle)", () => {
  it("attributes an untagged rejection by time so later files carry its rev", () => {
    const f1 = file(1, 1, "02");
    const f2 = file(2, 2, "06");
    const g = groupPbdbVersions({
      files: [f1, f2],
      reviews: [
        review(1, "Ann", "rejected_with_comments", "closed_rejected"),
        review(2, "Ann", "rejected_with_comments", "closed_rejected"),
      ],
      revisionHistory: [initial, rev("rejected", 1, null, "05"), rev("rejected", 2, 2, "08")],
      revisionNotesByCycle: noNotes,
    })!;
    expect(g.historical.map((h) => [h.fileId, h.revNumber])).toEqual([
      [f2.id, 1],
      [f1.id, 0],
    ]);
    expect(g.active).toMatchObject({ fileId: f2.id, revNumber: 2, badge: "draft" });
  });
});

describe("rejectedByLabel", () => {
  it("is null with no rejecters", () => {
    expect(rejectedByLabel({ names: [], count: 0 })).toBeNull();
  });
  it("names one, two and three rejecters inline", () => {
    expect(rejectedByLabel({ names: ["Ann"], count: 1 })).toBe("rejected by Ann");
    expect(rejectedByLabel({ names: ["Ann", "Bob"], count: 2 })).toBe("rejected by Ann and Bob");
    expect(rejectedByLabel({ names: ["Ann", "Bob", "Cy"], count: 3 })).toBe("rejected by Ann, Bob and Cy");
  });
  it("counts beyond three", () => {
    expect(rejectedByLabel({ names: ["A", "B", "C", "D"], count: 4 })).toBe("rejected by 4 stakeholders");
  });
});
