import { describe, it, expect } from "vitest";
import { validateDisciplines, consultantHasDiscipline, disciplineNamesFor } from "./disciplines";

describe("validateDisciplines", () => {
  it("accepts a single discipline", () => {
    expect(validateDisciplines(["s"])).toEqual({ ok: true, value: ["S"] });
  });

  it("accepts several, normalised to DISCIPLINES order and de-duplicated", () => {
    expect(validateDisciplines(["a", "F", "a", "c"])).toEqual({ ok: true, value: ["F", "A", "C"] });
  });

  it.each([[], [""], [" "], null, undefined])("rejects an empty selection %j", (v) => {
    expect(validateDisciplines(v as string[] | null).ok).toBe(false);
  });

  it("rejects a letter outside the fixed list", () => {
    const res = validateDisciplines(["S", "X"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/isn't a discipline/);
  });
});

describe("consultantHasDiscipline", () => {
  it("matches when the project's discipline is in the consultant's set", () => {
    expect(consultantHasDiscipline(["S", "F"], "F")).toBe(true);
  });

  it("does not match when it isn't", () => {
    expect(consultantHasDiscipline(["S"], "F")).toBe(false);
  });

  it("resolves a null/blank project suffix to the S default before comparing", () => {
    expect(consultantHasDiscipline(["S"], null)).toBe(true);
    expect(consultantHasDiscipline(["F"], null)).toBe(false);
  });

  it("never matches an untagged consultant (null or empty disciplines)", () => {
    expect(consultantHasDiscipline(null, "S")).toBe(false);
    expect(consultantHasDiscipline([], "S")).toBe(false);
  });
});

describe("disciplineNamesFor", () => {
  it("joins discipline names", () => {
    expect(disciplineNamesFor(["F", "A"])).toBe("Fire, Acoustics");
  });

  it("reports no disciplines for null/empty", () => {
    expect(disciplineNamesFor(null)).toBe("no disciplines");
    expect(disciplineNamesFor([])).toBe("no disciplines");
  });
});
