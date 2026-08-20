import * as Sentry from "@sentry/nextjs";

// Covers proxy.ts and any edge-runtime route handlers. Kept as a separate
// init from sentry.server.config.ts per Sentry's Next.js integration
// convention — the two run in different runtimes and are wired up via
// instrumentation.ts's NEXT_RUNTIME check.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
});
