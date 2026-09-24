import { describe, it, expect, vi } from "vitest";
import {
  validateProjectNumber,
  findDuplicateProjectNumber,
  duplicateProjectNumberError,
  isDuplicateProjectNumberDbError,
  PROJECT_NUMBER_RE,
  DEFAULT_NUMBER_SUFFIX,
  DISCIPLINES,
  disciplineNameForSuffix,
  validateNumberSuffix,
  resolveNumberSuffix,
  formatProjectNumber,
  getProjectNumberSuffix,
  getTemplateNumberSuffix,
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

describe("discipline suffix", () => {
  it("is the fixed six-discipline list", () => {
    expect(DISCIPLINES).toEqual([
      { name: "Fire", suffix: "F" },
      { name: "Solutions", suffix: "S" },
      { name: "Access", suffix: "D" },
      { name: "Acoustics", suffix: "A" },
      { name: "ESD", suffix: "E" },
      { name: "Code", suffix: "C" },
    ]);
  });

  it("defaults to S (Solutions)", () => {
    expect(DEFAULT_NUMBER_SUFFIX).toBe("S");
  });

  it("accepts any of the six letters and uppercases it", () => {
    expect(validateNumberSuffix("s")).toEqual({ ok: true, value: "S" });
    expect(validateNumberSuffix(" e ")).toEqual({ ok: true, value: "E" });
    for (const { suffix } of DISCIPLINES) {
      expect(validateNumberSuffix(suffix)).toEqual({ ok: true, value: suffix });
    }
  });

  it.each(["", "  ", "SE", "1", "-", "é", "X", "B", null, undefined])("rejects %j", (v) => {
    expect(validateNumberSuffix(v as string | null | undefined).ok).toBe(false);
  });

  it("resolves a stored value, falling back to the default for anything not in the list", () => {
    expect(resolveNumberSuffix("e")).toBe("E");
    expect(resolveNumberSuffix(null)).toBe("S");
    expect(resolveNumberSuffix("")).toBe("S");
    expect(resolveNumberSuffix("SE")).toBe("S");
    expect(resolveNumberSuffix("X")).toBe("S");
  });

  it("maps a letter back to its discipline name", () => {
    expect(disciplineNameForSuffix("f")).toBe("Fire");
    expect(disciplineNameForSuffix("D")).toBe("Access");
    expect(disciplineNameForSuffix("X")).toBeNull();
    expect(disciplineNameForSuffix(null)).toBeNull();
  });

  it("formats a project number with the template's suffix", () => {
    expect(formatProjectNumber("250012", "S")).toBe("250012-S");
    expect(formatProjectNumber("250012", "E")).toBe("250012-E");
    expect(formatProjectNumber("250012")).toBe("250012-S");
    expect(formatProjectNumber("250012", null)).toBe("250012-S");
  });
});

describe("suffix lookups", () => {
  function fake(row: unknown) {
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: row }) };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    return { from: vi.fn().mockReturnValue(chain) } as never;
  }

  it("reads the suffix from a template", async () => {
    expect(await getTemplateNumberSuffix(fake({ number_suffix: "E" }), "t1")).toBe("E");
  });

  it("defaults with no template id or a missing/blank suffix", async () => {
    expect(await getTemplateNumberSuffix(fake(null), null)).toBe("S");
    expect(await getTemplateNumberSuffix(fake(null), "t1")).toBe("S");
    expect(await getTemplateNumberSuffix(fake({ number_suffix: null }), "t1")).toBe("S");
  });

  it("reads the suffix through a project's embedded template (object or array)", async () => {
    expect(await getProjectNumberSuffix(fake({ templates: { number_suffix: "E" } }), "p1")).toBe("E");
    expect(await getProjectNumberSuffix(fake({ templates: [{ number_suffix: "E" }] }), "p1")).toBe("E");
    expect(await getProjectNumberSuffix(fake({ templates: null }), "p1")).toBe("S");
    expect(await getProjectNumberSuffix(fake(null), "p1")).toBe("S");
  });
});
