/**
 * Builds the PBDR filename per the naming convention:
 *   <<ProjectNo>>-S_PBDR_R<<n>>_<<address>>_<<YYYY_MM_DD>>.pdf
 *
 * Sanitisation rules:
 *   - Spaces → underscores
 *   - Commas / periods / apostrophes / quotes → removed
 *   - Slashes → hyphens
 *   - Any remaining non-alphanumeric (except _ and -) → removed
 *   - Project number → uppercased
 *   - Address segment preserves the casing from formatAddress; capped at 80 chars
 *   - Full filename capped at 200 chars
 */
/**
 * Builds the PBDB filename per the naming convention:
 *   <<ProjectNo>>-S PBDB Rev<<n>> <<address>> <<YYYY MM DD>> [For QA].docx
 *
 * Space-separated (unlike PBDR's underscore convention) — matches the
 * existing PBDB naming style. "For QA" sits at the end when the file is the
 * consultant-facing pre-dispatch draft; dropped once dispatched to the
 * stakeholder, at which point `date` should be the dispatch date, not the
 * original generation date.
 */
export function buildPbdbFilename(
  projectNumber: string,
  revisionIndex: number,
  address: string,
  date: Date,
  opts: { forQa?: boolean } = {}
): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const parts = [
    `${projectNumber}-S PBDB Rev${revisionIndex}`,
    address,
    `${yyyy} ${mm} ${dd}`,
  ].filter(Boolean);

  const base = parts.join(" ") + (opts.forQa ? " For QA" : "");
  return `${base}.docx`;
}

export function buildPbdrFilename(
  projectNumber: string,
  revisionIndex: number,
  address: string,
  date: Date
): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  function sanitize(s: string, maxLen?: number): string {
    const r = s
      .replace(/\s+/g, "_")
      .replace(/[,.'"""''`]/g, "")
      .replace(/\//g, "-")
      .replace(/[^A-Za-z0-9_\-]/g, "");
    return maxLen ? r.slice(0, maxLen) : r;
  }

  const projPart = sanitize(projectNumber).toUpperCase();
  const addrPart = sanitize(address, 80);
  const datePart = `${yyyy}_${mm}_${dd}`;

  const raw = `${projPart}-S_PBDR_R${revisionIndex}_${addrPart}_${datePart}.pdf`;
  return raw.slice(0, 200);
}
