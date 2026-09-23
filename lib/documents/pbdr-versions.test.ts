import { describe, expect, it } from "vitest";
import { groupPbdrVersions, type PbdrFileRow, type PbdrRevisionRow } from "./pbdr-versions";

const pbdr = (version: number, day: string): PbdrFileRow => ({
  id: `p${version}`,
  original_filename: `pbdr-v${version}.docx`,
  version,
  created_at: `2026-09-${day}T00:00:00Z`,
});

const conversion = (revNumber: number, day: string): PbdrRevisionRow => ({
  doc_type: "pbdr",
  event: "approved_conversion",
  rev_number: revNumber,
  created_at: `2026-09-${day}T00:00:00Z`,
});

const reverted = (revNumber: number, day: string): PbdrRevisionRow => ({
  doc_type: "pbdb",
  event: "reverted",
  rev_number: revNumber,
  created_at: `2026-09-${day}T00:00:00Z`,
});

describe("groupPbdrVersions", () => {
  it("returns null with no files", () => {
    expect(groupPbdrVersions({ files: [], revisionHistory: [] })).toBeNull();
  });

  it("a single delivered PBDR is Active with no history and no drafts tier", () => {
    const g = groupPbdrVersions({ files: [pbdr(1, "10")], revisionHistory: [conversion(0, "10")] })!;
    expect(g.active).toMatchObject({ fileId: "p1", revNumber: 0, badge: "none", ctaCopy: null });
    expect(g.historical).toEqual([]);
    expect(g).not.toHaveProperty("drafts");
  });

  it("delivered then reverted with no reconversion yet: nothing is Active, the delivered PBDR is Historical (reverted)", () => {
    const g = groupPbdrVersions({
      files: [pbdr(1, "10")],
      revisionHistory: [conversion(0, "10"), reverted(1, "12")],
    })!;
    expect(g.active).toBeNull();
    expect(g.historical).toHaveLength(1);
    expect(g.historical[0]).toMatchObject({ fileId: "p1", outcome: "reverted", revNumber: 0 });
    expect(g.historical[0].rejectedBy).toEqual({ names: [], count: 0 });
  });

  it("reconverted after a revert: the new PBDR is Active, the reverted one is Historical", () => {
    const g = groupPbdrVersions({
      files: [pbdr(1, "10"), pbdr(2, "15")],
      revisionHistory: [conversion(0, "10"), reverted(1, "12"), conversion(1, "15")],
    })!;
    expect(g.active).toMatchObject({ fileId: "p2", revNumber: 1 });
    expect(g.historical.map((h) => [h.fileId, h.outcome, h.revNumber])).toEqual([["p1", "reverted", 0]]);
  });

  it("an older PBDR replaced without a recorded revert reads as replaced, newest history first", () => {
    const g = groupPbdrVersions({
      files: [pbdr(1, "10"), pbdr(2, "15"), pbdr(3, "20")],
      revisionHistory: [conversion(0, "10"), conversion(1, "15"), conversion(2, "20")],
    })!;
    expect(g.active?.fileId).toBe("p3");
    expect(g.historical.map((h) => [h.fileId, h.outcome])).toEqual([
      ["p2", "replaced"],
      ["p1", "replaced"],
    ]);
  });

  it("falls back to position for the rev when conversion rows are missing", () => {
    const g = groupPbdrVersions({ files: [pbdr(1, "10"), pbdr(2, "15")], revisionHistory: [] })!;
    expect(g.active?.revNumber).toBe(1);
    expect(g.historical[0].revNumber).toBe(0);
  });
});
