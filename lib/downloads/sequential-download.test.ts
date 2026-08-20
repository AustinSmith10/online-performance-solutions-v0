import { describe, it, expect } from "vitest";
import { rowStatus, nextIndex } from "./sequential-download";

describe("rowStatus", () => {
  it("is idle before its turn", () => {
    expect(rowStatus(2, 0, new Set(), "id-2")).toBe("idle");
  });

  it("is downloading when it's the active index", () => {
    expect(rowStatus(1, 1, new Set(), "id-1")).toBe("downloading");
  });

  it("is done once its id is in the completed set, even if index no longer matches active", () => {
    expect(rowStatus(0, 2, new Set(["id-0"]), "id-0")).toBe("done");
  });

  it("prefers done over downloading if both would otherwise apply", () => {
    expect(rowStatus(1, 1, new Set(["id-1"]), "id-1")).toBe("done");
  });
});

describe("nextIndex", () => {
  it("advances to the next index while more items remain", () => {
    expect(nextIndex(0, 3)).toBe(1);
    expect(nextIndex(1, 3)).toBe(2);
  });

  it("returns null once the last item completes", () => {
    expect(nextIndex(2, 3)).toBeNull();
  });

  it("returns null immediately for a single-item queue", () => {
    expect(nextIndex(0, 1)).toBeNull();
  });
});
