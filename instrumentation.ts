import type { Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Server-side error hook — catches errors Next.js's own error boundaries
// don't reach (e.g. errors thrown during routing/rendering before a route's
// error.tsx can take over). request.headers carries the x-request-id set in
// proxy.ts (lib/observability/request-context.ts), so this event and any
// worker-side event for the same request share a tag to join on.
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const Sentry = await import("@sentry/nextjs");
  const requestId = request.headers["x-request-id"];
  Sentry.captureException(err, {
    tags: {
      requestId: Array.isArray(requestId) ? requestId[0] : requestId,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    },
  });
};
