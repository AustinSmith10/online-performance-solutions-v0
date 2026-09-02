import * as Sentry from "@sentry/nextjs";

// Browser-side init. NEXT_PUBLIC_SENTRY_DSN (not SENTRY_DSN) because this
// file ships to the client bundle — the DSN is not a secret (it's meant to
// be public, same as any client-side analytics key), but it must come from
// a NEXT_PUBLIC_ var to be available here at all.
// `TypeError: Load failed` (Safari/WebKit) and `TypeError: Failed to fetch`
// (Chromium) are what a fetch() rejects with when the request never completes
// — the user navigated away mid-request, closed the tab, dropped off wifi, a
// proxy killed an idle stream (e.g. our SSE preview stream on close). They are
// not application bugs: a real server failure resolves the fetch with an
// !ok Response instead. Left unfiltered these are the single noisiest
// "escalating" issue on the admin project page.
const TRANSIENT_FETCH_MESSAGES = [
  "Load failed",
  "Failed to fetch",
  "NetworkError when attempting to fetch resource",
  "The network connection was lost",
  "cancelled",
  "The operation was aborted",
];

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_RAILWAY_ENVIRONMENT_NAME ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

  beforeSend(event, hint) {
    const err = hint?.originalException;
    const message = err instanceof Error ? err.message : typeof err === "string" ? err : event.exception?.values?.[0]?.value ?? "";
    const type = err instanceof Error ? err.name : event.exception?.values?.[0]?.type ?? "";
    if (type === "TypeError" && TRANSIENT_FETCH_MESSAGES.some((m) => message.includes(m))) {
      return null;
    }
    return event;
  },

  // Session Replay is off — this app renders client business/financial data
  // on-screen (AUDIT.md profile: "data_sensitivity: broad and sensitive"),
  // and replay capture defaults to recording DOM content. Not worth the risk
  // for a monitoring nice-to-have; revisit with masking configured if wanted later.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
