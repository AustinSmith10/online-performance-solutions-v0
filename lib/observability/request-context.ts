import "server-only";

/**
 * Request ID propagation (web side only).
 *
 * proxy.ts generates one ID per request and sets it as both a request header
 * (so it reaches Server Components/Route Handlers/Server Actions) and a
 * response header (so it's visible to clients/support). Consumers read it
 * back via getRequestId(), which just reads the header — Next.js already
 * isolates `headers()` per request via its own AsyncLocalStorage, so no
 * custom ALS is needed here.
 *
 * worker.ts has no equivalent: every current pg-boss queue is cron-triggered
 * (see worker.ts), not enqueued from a web request, so there's no request ID
 * to thread through a job payload today. Worker-side error events are
 * correlated by pg-boss's own job.id + queue name instead (see the `work()`
 * wrapper in worker.ts) — if a request-triggered job is reintroduced later,
 * thread the ID through that job's payload at enqueue time rather than
 * reaching for ALS here.
 */

export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Returns the current request's correlation ID, or undefined outside a
 * request. Safe to call from Server Components, Route Handlers, and Server
 * Actions. Not available in the browser.
 */
export async function getRequestId(): Promise<string | undefined> {
  const { headers } = await import("next/headers");
  const headerList = await headers();
  return headerList.get(REQUEST_ID_HEADER) ?? undefined;
}
