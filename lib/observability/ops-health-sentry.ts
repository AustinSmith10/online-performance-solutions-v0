// No `import "server-only"` here on purpose: this helper is imported (lazily)
// by lib/email/sender.ts, which is deliberately kept server-only-free so it
// stays cheap to pull in. captureOpsHealthEvent is self-contained and
// swallows every error, so it's safe wherever it's called from; the modules
// that own real server-only concerns keep their own guard.

type OpsHealthCategory = "ai-provider-failure" | "email-send-failure" | "credit-race";

/**
 * Mirrors the operational failure classes surfaced on the admin System Health
 * page (AI provider quota/rate-limit failures, email send failures, credit
 * race conditions) into Sentry.
 *
 * These are all deliberately fail-open: the calling code catches the
 * underlying error, writes a row to its own Postgres table, and carries on
 * without re-throwing — so Sentry's normal exception capture never sees them.
 * This is the one bridge that gets them into Sentry for alerting and trend
 * visibility, without changing the fail-open behaviour or the System Health
 * UX (the Postgres tables remain the source of truth for the resolve
 * workflow; Sentry is purely for routing/aggregation).
 *
 * `category` (+ optional `fingerprintKey`) drives the Sentry fingerprint, so
 * each class aggregates into its own issue rather than being lumped together
 * or scattered one-issue-per-message. When called inside a web request the
 * event carries the same `requestId` tag as any related `onRequestError`
 * event, so the two can be joined. Never throws.
 *
 * Deliberately does not pass recipient emails or other client PII through —
 * see the sendDefaultPii note in sentry.server.config.ts. Callers pass IDs
 * and error strings only; an admin follows those back to the full row on the
 * System Health page.
 */
export async function captureOpsHealthEvent(opts: {
  category: OpsHealthCategory;
  fingerprintKey?: string;
  message: string;
  level?: "warning" | "error";
  extra?: Record<string, unknown>;
  projectId?: string;
}): Promise<void> {
  try {
    const Sentry = await import("@sentry/nextjs");

    let requestId: string | undefined;
    try {
      const { getRequestId } = await import("./request-context");
      requestId = await getRequestId();
    } catch {
      // Outside a web request (e.g. a pg-boss worker job) — no correlation
      // id to attach. Worker-side events correlate by job id + queue name.
    }

    Sentry.captureMessage(opts.message, {
      level: opts.level ?? "warning",
      tags: {
        ops_health: opts.category,
        ...(requestId ? { requestId } : {}),
        ...(opts.projectId ? { projectId: opts.projectId } : {}),
      },
      fingerprint: ["ops-health", opts.category, opts.fingerprintKey ?? ""],
      extra: opts.extra,
    });
  } catch (err) {
    console.error("[ops-health-sentry] captureOpsHealthEvent failed:", err);
  }
}
