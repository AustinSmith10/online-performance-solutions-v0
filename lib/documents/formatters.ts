/**
 * Parses common date formats extracted from documents and reformats to DD/MM/YYYY.
 * Returns the original string unchanged if the format is unrecognised.
 */
export function normalizeDateValue(value: string): string {
  const v = value.trim();
  const dot = v.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dot) return `${dot[1].padStart(2, "0")}/${dot[2].padStart(2, "0")}/${dot[3]}`;
  const dash = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dash) return `${dash[1].padStart(2, "0")}/${dash[2].padStart(2, "0")}/${dash[3]}`;
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return v;
  return value;
}

/**
 * Converts a raw all-caps extracted address to a properly formatted string.
 *   "SITE 228 / 85 TWISTS RD, BURPENGARY EAST QLD"
 *   → "Site 228, 85 Twists Road, Burpengary East QLD"
 *
 * - " / " → ", "
 * - Each word is title-cased
 * - Australian state/territory codes stay uppercase
 * - Common street-type abbreviations are expanded
 */
export function formatAddress(raw: string): string {
  const STATES = new Set(["QLD", "NSW", "VIC", "SA", "WA", "TAS", "ACT", "NT"]);
  const STREET_TYPES: Record<string, string> = {
    RD: "Road", ST: "Street", AVE: "Avenue", DR: "Drive", CT: "Court",
    PL: "Place", BLVD: "Boulevard", CRES: "Crescent", CR: "Crescent",
    TCE: "Terrace", HWY: "Highway", PKWY: "Parkway", LN: "Lane",
    GR: "Grove", CL: "Close", WAY: "Way", CCT: "Circuit",
  };

  return raw
    .replace(/\s*\/\s*/g, ", ")
    .split(",")
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .map((word) => {
          const up = word.toUpperCase();
          if (STATES.has(up)) return up;
          if (STREET_TYPES[up]) return STREET_TYPES[up];
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        })
        .join(" ")
    )
    .join(", ");
}

/**
 * Applies field-level formatting to a map of extracted token values.
 * Tokens containing "DATE" are normalised to DD/MM/YYYY.
 * Tokens containing "ADDRESS" are title-cased with street type expansion.
 */
export function normalizeExtractedFields(
  fields: Record<string, string>
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k.includes("DATE")) {
      result[k] = normalizeDateValue(v);
    } else if (k.includes("ADDRESS")) {
      result[k] = formatAddress(v);
    } else {
      result[k] = v;
    }
  }
  return result;
}
