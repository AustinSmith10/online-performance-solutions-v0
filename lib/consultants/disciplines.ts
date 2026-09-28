import { DISCIPLINES, disciplineNameForSuffix, resolveNumberSuffix } from "@/lib/projects/project-number";

// A consultant's disciplines are a subset of the same fixed six letters a
// template carries (lib/projects/project-number.ts's DISCIPLINES). This file
// is the consultant-side half: which letters a consultant is tagged with,
// and whether that set covers a given project's discipline.

const VALID_SUFFIXES = new Set<string>(DISCIPLINES.map((d) => d.suffix));

export type DisciplinesValidation =
  | { ok: true; value: string[] }
  | { ok: false; error: string };

/**
 * Trims/uppercases/de-duplicates a raw list of letters and requires at least
 * one, all from DISCIPLINES. Order is normalised to DISCIPLINES' own order so
 * two equivalent selections always compare and display the same way.
 */
export function validateDisciplines(raw: (string | null | undefined)[] | null | undefined): DisciplinesValidation {
  const cleaned = new Set((raw ?? []).map((v) => (v ?? "").trim().toUpperCase()).filter(Boolean));
  if (cleaned.size === 0) {
    return { ok: false, error: "Select at least one discipline." };
  }
  for (const v of cleaned) {
    if (!VALID_SUFFIXES.has(v)) {
      return {
        ok: false,
        error: `"${v}" isn't a discipline. Choose from: ${DISCIPLINES.map((d) => `${d.name} (${d.suffix})`).join(", ")}.`,
      };
    }
  }
  const value = DISCIPLINES.map((d) => d.suffix).filter((s) => cleaned.has(s));
  return { ok: true, value };
}

/** True when `disciplines` covers `projectSuffix` (resolved through the same S default a template uses). */
export function consultantHasDiscipline(
  disciplines: string[] | null | undefined,
  projectSuffix: string | null | undefined
): boolean {
  if (!disciplines || disciplines.length === 0) return false;
  return disciplines.includes(resolveNumberSuffix(projectSuffix));
}

/** Human-readable list for error messages and display, e.g. "Fire, Acoustics". */
export function disciplineNamesFor(disciplines: string[] | null | undefined): string {
  if (!disciplines || disciplines.length === 0) return "no disciplines";
  return disciplines.map((s) => disciplineNameForSuffix(s) ?? s).join(", ");
}
