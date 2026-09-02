import { describe, it, expect, vi } from "vitest";
import {
  validateProjectNumber,
  findDuplicateProjectNumber,
  duplicateProjectNumberError,
  isDuplicateProjectNumberDbError,
  PROJECT_NUMBER_RE,
} from "./project-number";

describe("validateProjectNumber", () => {
  it("accepts exactly six digits", () => {
    expect(validateProjectNumber("250001")).toEqual({ ok: true, value: "250001" });
    expect(validateProjectNumber("000000")).toEqual({ ok: true, value: "000000" });
  });

  it("trims surrounding whitespace before validating", () => {
    expect(validateProjectNumber("  250001  ")).toEqual({ ok: true, value: "250001" });
  });

  it("rejects wrong length, letters, symbols and blank", () => {
    for (const bad of ["25001", "2500012", "25000A", "250-001", "abcdef", "", "   "]) {
      const r = validateProjectNumber(bad);
      expect(r.ok, `expected "${bad}" to be rejected`).toBe(false);
    }
  });

  it("rejects null / undefined", () => {
    expect(validateProjectNumber(null).ok).toBe(false);
    expect(validateProjectNumber(undefined).ok).toBe(false);
  });

  it("grandfathers the two legacy NNNN-NNN numbers", () => {
    expect(validateProjectNumber("2113-163")).toEqual({ ok: true, value: "2113-163" });
    expect(validateProjectNumber("2116-037")).toEqual({ ok: true, value: "2116-037" });
    // but not other NNNN-NNN shapes
    expect(validateProjectNumber("2113-164").ok).toBe(false);
  });

  it("PROJECT_NUMBER_RE is anchored", () => {
    expect(PROJECT_NUMBER_RE.test("x250001x")).toBe(false);
    expect(PROJECT_NUMBER_RE.test("250001")).toBe(true);
  });
});

describe("findDuplicateProjectNumber", () => {
  function mockSupabase(rows: unknown[]) {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "is"]) chain[m] = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve({ data: rows, error: null }));
    return { from: vi.fn(() => chain) } as never;
  }

  it("returns null when nothing else carries the number", async () => {
    expect(await findDuplicateProjectNumber(mockSupabase([]), "250001", "p1")).toBeNull();
  });

  it("labels the other project with its address when present", async () => {
    const match = await findDuplicateProjectNumber(
      mockSupabase([{ id: "p2", project_number: "250001", site_address: "1 Smith St", extracted_fields: null }]),
      "250001",
      "p1"
    );
    expect(match).toEqual({ id: "p2", label: "250001 — 1 Smith St" });
  });

  it("falls back to EXTRACT_ADDRESS then bare number", async () => {
    const viaExtract = await findDuplicateProjectNumber(
      mockSupabase([{ id: "p2", project_number: "250001", site_address: null, extracted_fields: { EXTRACT_ADDRESS: "2 Jones Rd" } }]),
      "250001",
      "p1"
    );
    expect(viaExtract?.label).toBe("250001 — 2 Jones Rd");

    const bare = await findDuplicateProjectNumber(
      mockSupabase([{ id: "p2", project_number: "250001", site_address: null, extracted_fields: null }]),
      "250001",
      "p1"
    );
    expect(bare?.label).toBe("250001");
  });
});

describe("duplicateProjectNumberError", () => {
  it("names the conflicting project when the label adds an address", () => {
    expect(duplicateProjectNumberError("250001", { id: "p2", label: "250001 — 1 Smith St" })).toBe(
      "Project number 250001 is already used by another live project (250001 — 1 Smith St). Enter a different number."
    );
  });

  it("omits the parenthetical when there's no extra detail", () => {
    expect(duplicateProjectNumberError("250001", { id: "p2", label: "250001" })).toBe(
      "Project number 250001 is already used by another live project. Enter a different number."
    );
    expect(duplicateProjectNumberError("250001")).toBe(
      "Project number 250001 is already used by another live project. Enter a different number."
    );
  });
});

describe("isDuplicateProjectNumberDbError", () => {
  it("matches a 23505 unique violation or the index name", () => {
    expect(isDuplicateProjectNumberDbError({ code: "23505" })).toBe(true);
    expect(
      isDuplicateProjectNumberDbError({ message: 'duplicate key value violates unique constraint "projects_project_number_live_key"' })
    ).toBe(true);
  });

  it("ignores other errors and null", () => {
    expect(isDuplicateProjectNumberDbError({ code: "23503", message: "fk" })).toBe(false);
    expect(isDuplicateProjectNumberDbError(null)).toBe(false);
  });
});
