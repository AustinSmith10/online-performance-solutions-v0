import type { SupabaseClient } from "@supabase/supabase-js";

// The canonical project number is exactly six digits. The "-S" seen in the
// UI is a discipline suffix (S = Solutions) the app appends to generated
// document names — it is never stored and never entered here.
export const PROJECT_NUMBER_RE = /^\d{6}$/;

// Two projects predate the six-digit convention and are grandfathered: they
// must keep saving/round-tripping without being retro-validated (matches the
// `NOT VALID` DB constraint in migration 00000000000129). Any other
// non-conforming value is rejected.
export const LEGACY_PROJECT_NUMBERS: ReadonlySet<string> = new Set([
  "2113-163",
  "2116-037",
]);

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
      error: "Project number must be exactly six digits (e.g. 250001). The “-S” suffix is added automatically.",
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
