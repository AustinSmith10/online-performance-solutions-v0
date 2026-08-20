import * as Sentry from "@sentry/nextjs";

// Browser-side init. NEXT_PUBLIC_SENTRY_DSN (not SENTRY_DSN) because this
// file ships to the client bundle — the DSN is not a secret (it's meant to
// be public, same as any client-side analytics key), but it must come from
// a NEXT_PUBLIC_ var to be available here at all.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  // Session Replay is off — this app renders client business/financial data
  // on-screen (AUDIT.md profile: "data_sensitivity: broad and sensitive"),
  // and replay capture defaults to recording DOM content. Not worth the risk
  // for a monitoring nice-to-have; revisit with masking configured if wanted later.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
