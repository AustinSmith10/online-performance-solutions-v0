import type { SupabaseClient } from "@supabase/supabase-js";

// The canonical project number is exactly six digits. The "-S" seen in the
// UI is a discipline suffix the app appends to generated document names — it
// is never stored on the project and never entered here. It comes from the
// project's template (`templates.number_suffix`), so each discipline's
// template carries its own letter, drawn from the fixed list below.
export const PROJECT_NUMBER_RE = /^\d{6}$/;

/** The only disciplines OPS knows about, and the letter each appends to a project number. */
export const DISCIPLINES = [
  { name: "Fire", suffix: "F" },
  { name: "Solutions", suffix: "S" },
  { name: "Access", suffix: "D" },
  { name: "Acoustics", suffix: "A" },
  { name: "ESD", suffix: "E" },
  { name: "Code", suffix: "C" },
] as const;

export type DisciplineSuffix = (typeof DISCIPLINES)[number]["suffix"];

const SUFFIX_TO_DISCIPLINE = new Map<string, string>(DISCIPLINES.map((d) => [d.suffix, d.name]));

/** Suffix used when a template has none (older rows, or a project with no template). */
export const DEFAULT_NUMBER_SUFFIX: DisciplineSuffix = "S";

/** The discipline name for a letter, or null if it isn't one of DISCIPLINES. */
export function disciplineNameForSuffix(suffix: string | null | undefined): string | null {
  return SUFFIX_TO_DISCIPLINE.get((suffix ?? "").trim().toUpperCase()) ?? null;
}

export type NumberSuffixValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/** Trims, uppercases and enforces one of the DISCIPLINES letters. */
export function validateNumberSuffix(raw: string | null | undefined): NumberSuffixValidation {
  const value = (raw ?? "").trim().toUpperCase();
  if (!SUFFIX_TO_DISCIPLINE.has(value)) {
    return {
      ok: false,
      error: `Choose a discipline: ${DISCIPLINES.map((d) => `${d.name} (${d.suffix})`).join(", ")}.`,
    };
  }
  return { ok: true, value };
}

/** A stored suffix if it is one of DISCIPLINES, otherwise the default. Never throws. */
export function resolveNumberSuffix(suffix: string | null | undefined): string {
  const v = (suffix ?? "").trim().toUpperCase();
  return SUFFIX_TO_DISCIPLINE.has(v) ? v : DEFAULT_NUMBER_SUFFIX;
}

/** "250012" + "S" -> "250012-S". */
export function formatProjectNumber(number: string, suffix?: string | null): string {
  return `${number}-${resolveNumberSuffix(suffix)}`;
}

/**
 * The suffix a project's documents carry: its template's `number_suffix`, or
 * the default when there is no template or the column is empty.
 */
export async function getTemplateNumberSuffix(
  supabase: SupabaseClient,
  templateId: string | null | undefined
): Promise<string> {
  if (!templateId) return DEFAULT_NUMBER_SUFFIX;
  const { data } = await supabase
    .from("templates")
    .select("number_suffix")
    .eq("id", templateId)
    .maybeSingle();
  return resolveNumberSuffix((data as { number_suffix?: string | null } | null)?.number_suffix);
}

// Two projects predate the six-digit convention and are grandfathered: they
// must keep saving/round-tripping without being retro-validated (matches the
// `NOT VALID` DB constraint in migration 00000000000129). Any other
// non-conforming value is rejected.
export const LEGACY_PROJECT_NUMBERS: ReadonlySet<string> = new Set([
  "2113-163",
  "2116-037",
]);

/**
 * Same as getTemplateNumberSuffix, starting from a project id (the template is
 * read through the project's `template_id` in one query). Falls back to the
 * default when the project or template can't be read, so document naming never
 * fails because of the suffix.
 */
export async function getProjectNumberSuffix(
  supabase: SupabaseClient,
  projectId: string
): Promise<string> {
  const { data } = await supabase
    .from("projects")
    .select("templates(number_suffix)")
    .eq("id", projectId)
    .maybeSingle();
  const t = (data as { templates?: { number_suffix?: string | null } | { number_suffix?: string | null }[] | null } | null)?.templates;
  const row = Array.isArray(t) ? t[0] : t;
  return resolveNumberSuffix(row?.number_suffix);
}

export type ProjectNumberValidation =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Shared validator for every project-number entry point (admin set/override,
 * admin dashboard drawer, consultant self-serve, combined details save).
 * Trims the input and enforces `^\d{6}$`, grandfathering the two legacy
 * `NNNN-NNN` numbers.
 */
export function validateProjectNumber(raw: string | null | undefined): ProjectNumberValidation {
  const value = (raw ?? "").trim();
  if (!value) return { ok: false, error: "Project number is required." };
  if (LEGACY_PROJECT_NUMBERS.has(value)) return { ok: true, value };
  if (!PROJECT_NUMBER_RE.test(value)) {
    return {
      ok: false,
      error: "Project number must be exactly six digits (e.g. 250001). The discipline suffix is added automatically.",
    };
  }
  return { ok: true, value };
}

export interface DuplicateProjectNumberMatch {
  id: string;
  label: string;
}

/**
 * A project number identifies exactly one live project (enforced by the
 * `projects_project_number_live_key` partial unique index, migration
 * 00000000000135). This is the friendly pre-check the save actions run so
 * they can name the conflicting project; the index is the race-safe backstop.
 * "Live" = not soft-deleted, so a deleted project's number is free to reuse.
 */
export async function findDuplicateProjectNumber(
  supabase: SupabaseClient,
  projectNumber: string,
  excludeProjectId: string
): Promise<DuplicateProjectNumberMatch | null> {
  const { data } = await supabase
    .from("projects")
    .select("id, project_number, site_address, extracted_fields")
    .eq("project_number", projectNumber)
    .neq("id", excludeProjectId)
    .is("deleted_at", null)
    .limit(1);

  const row = data?.[0];
  if (!row) return null;

  const address =
    (row.site_address as string | null) ??
    ((row.extracted_fields as Record<string, string> | null)?.["EXTRACT_ADDRESS"] ?? null);

  return {
    id: row.id as string,
    label: address ? `${projectNumber} — ${address}` : projectNumber,
  };
}

/** Shared rejection message for a project number that's already in use. */
export function duplicateProjectNumberError(
  projectNumber: string,
  match?: DuplicateProjectNumberMatch | null
): string {
  const where = match?.label && match.label !== projectNumber ? ` (${match.label})` : "";
  return `Project number ${projectNumber} is already used by another live project${where}. Enter a different number.`;
}

/** True when a Supabase write failed the project-number unique index. */
export function isDuplicateProjectNumberDbError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /projects_project_number_live_key/.test(error.message ?? "");
}
