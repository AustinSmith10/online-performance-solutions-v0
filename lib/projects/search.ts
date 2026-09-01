/**
 * Shared free-text project search.
 *
 * The admin projects list and the recovery page both let an admin type a
 * search term. Historically each built its own PostgREST `.or(...)` string
 * matching only `site_address` and `po_number` — but `site_address` is
 * `null` for every portal-submitted project (the address lives in
 * `extracted_fields->>EXTRACT_ADDRESS`), and `project_number` was never
 * searched at all. So searching by the address shown on a portal card, or
 * by project number, returned nothing (#173).
 *
 * `buildProjectSearchFilter` returns the `.or(...)` argument covering all
 * four places an identifier can live. PostgREST accepts the JSON arrow
 * (`extracted_fields->>EXTRACT_ADDRESS`) as a column reference inside `.or()`
 * exactly as it does in `.filter()`.
 */

/** Strip characters that would break out of a PostgREST `.or()` filter string. */
function sanitiseTerm(term: string): string {
  // `,` separates OR clauses, `(`/`)` group them, `%` is our own wildcard,
  // `*` is PostgREST's wildcard alias. Drop them all rather than attempt to
  // escape — a search term never legitimately contains them.
  return term.trim().replace(/[,()%*]/g, "");
}

/**
 * Build the `.or(...)` filter for a project free-text search over
 * `project_number`, `po_number`, `site_address`, and the extracted address.
 *
 * Returns `null` when the term is empty (or only special characters), so
 * callers can skip applying a filter entirely.
 */
export function buildProjectSearchFilter(term: string | null | undefined): string | null {
  const cleaned = sanitiseTerm(term ?? "");
  if (!cleaned) return null;

  const like = `%${cleaned}%`;
  return [
    `project_number.ilike.${like}`,
    `po_number.ilike.${like}`,
    `site_address.ilike.${like}`,
    `extracted_fields->>EXTRACT_ADDRESS.ilike.${like}`,
  ].join(",");
}
