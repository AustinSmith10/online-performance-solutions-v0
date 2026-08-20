import * as Sentry from "@sentry/nextjs";

// Empty DSN is a valid, intentional state until a Sentry project exists —
// the SDK just no-ops rather than throwing, so this file is safe to ship
// ahead of having real credentials.
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,

  // Errors are always captured; traces are sampled — this is a low-traffic
  // internal B2B app, not a place that needs trace volume, and unsampled
  // tracing would burn quota for no diagnostic benefit.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // sendDefaultPii defaults to false and is left unset here deliberately —
  // this app already logs client contact PII in places (AUDIT.md #10);
  // don't let Sentry become a second unredacted copy of it.
});
