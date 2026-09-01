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
 * Duplicate project numbers are allowed by design (the same number can span
 * disciplines/sites), so this never blocks a save — it just surfaces a
 * non-blocking warning naming the other live project that already carries
 * the number. "Live" = not soft-deleted.
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
