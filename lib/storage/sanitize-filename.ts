// #142: client- and externally-supplied filenames (including one site fed
// directly by an external email sender, not an authenticated user) are used
// as the final path segment of Supabase Storage object keys. Without
// sanitization a filename like "../../.env" or a URL-encoded traversal
// sequence could escape the intended folder. This only ever touches the
// final segment of a storage path — leading segments carry storage RLS
// tenant isolation (policies like (storage.foldername(name))[1] = org_id)
// and must never be sanitized here.

const MAX_LENGTH = 200;

// Strips/replaces anything outside [a-zA-Z0-9._-], collapses repeated dots
// (so "../.." can't survive as a traversal-looking sequence even after the
// slash separator is gone), and caps length so an absurdly long filename
// can't blow out the object key.
export function sanitizeFilename(name: string): string {
  let decoded = name;
  try {
    // Best-effort: a URL-encoded traversal sequence (e.g. "%2e%2e%2f") should
    // sanitize the same as its decoded form. If decoding fails (malformed
    // percent-escapes), fall back to the raw input.
    decoded = decodeURIComponent(name);
  } catch {
    decoded = name;
  }

  let safe = decoded.replace(/[^a-zA-Z0-9._-]/g, "_");
  safe = safe.replace(/\.{2,}/g, ".");
  safe = safe.replace(/^[.]+/, "");

  if (!safe) safe = "file";
  if (safe.length > MAX_LENGTH) {
    const dotIdx = safe.lastIndexOf(".");
    if (dotIdx > 0 && safe.length - dotIdx <= 20) {
      const ext = safe.slice(dotIdx);
      safe = safe.slice(0, MAX_LENGTH - ext.length) + ext;
    } else {
      safe = safe.slice(0, MAX_LENGTH);
    }
  }

  return safe;
}
