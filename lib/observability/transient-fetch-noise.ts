// Shared by instrumentation-client.ts's Sentry beforeSend, which uses this to
// collapse matching events into one `warning`-level issue (not drop them).
// Pure + unit-tested (transient-fetch-noise.test.ts) because a too-loose match
// here would still downgrade and hide real bugs.

/**
 * Browser-native messages a fetch() rejects with when the request never
 * completes (navigation away, tab close, offline, a proxy killing an idle
 * stream). A real server failure resolves with an !ok Response and never
 * throws, so none of these represent an application bug.
 *
 * Full-string matches only — an app-authored `new TypeError("Download
 * failed: …")` must not be caught by a "Load failed" substring.
 */
export const TRANSIENT_FETCH_MESSAGES: ReadonlySet<string> = new Set([
  "Load failed", // Safari / WebKit
  "Failed to fetch", // Chromium
  "NetworkError when attempting to fetch resource.", // Firefox
  "The network connection was lost.", // iOS Safari
  "The Internet connection appears to be offline.", // iOS Safari
]);

export interface ErrorShape {
  /** hint.originalException — the thrown value, when the SDK kept a reference. */
  originalException?: unknown;
  /** event.exception.values[0] — always present once the SDK has processed it. */
  exceptionValue?: string;
  exceptionType?: string;
  /** mechanism.handled — false for global-handler auto-captures. */
  handled?: boolean;
}

/**
 * True only for an UNHANDLED `TypeError` whose entire message equals a known
 * browser fetch-abort string. Deliberately narrow:
 *   - handled !== false (i.e. a Sentry.captureException call) → always kept;
 *   - a non-TypeError (AbortError, DOMException, custom) → always kept;
 *   - any extra text in the message (`"Failed to fetch /api/x"`) → kept.
 */
export function isTransientFetchNoise(err: ErrorShape): boolean {
  if (err.handled !== false) return false;

  const original = err.originalException;
  const message =
    original instanceof Error ? original.message : err.exceptionValue ?? "";
  const type =
    original instanceof Error ? original.name : err.exceptionType ?? "";

  return type === "TypeError" && TRANSIENT_FETCH_MESSAGES.has(message.trim());
}
