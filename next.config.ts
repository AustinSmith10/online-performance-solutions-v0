import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { readFileSync, writeFileSync } from "fs";

// Version-skew protection: with a deploymentId set, a browser still holding a
// page from the previous deploy does a full reload on its next navigation or
// server action, instead of calling a server action ID the new build no
// longer has ("Failed to find Server Action" → error page).
//
// The value must be identical at build time and when `next start` re-reads
// this config, or every request looks like a mismatch and pages keep
// reloading. So the build records Railway's commit SHA in a file that ships
// with the build output, and the server falls back to that file if the env
// var isn't present at runtime. No SHA at build (local dev) → undefined →
// feature off, same as before.
const DEPLOYMENT_ID_FILE = ".deployment-id";
function resolveDeploymentId(): string | undefined {
  const fromEnv = process.env.RAILWAY_GIT_COMMIT_SHA?.trim();
  if (fromEnv) {
    try {
      writeFileSync(DEPLOYMENT_ID_FILE, fromEnv);
    } catch {
      // Read-only filesystem at runtime — the build already wrote it.
    }
    return fromEnv;
  }
  try {
    return readFileSync(DEPLOYMENT_ID_FILE, "utf8").trim() || undefined;
  } catch {
    return undefined;
  }
}

const nextConfig: NextConfig = {
  deploymentId: resolveDeploymentId(),
  experimental: {
    serverActions: {
      // Must be >= the largest file-size limit any server action itself
      // enforces (uploadQaPbdb in app/actions/projects.ts allows up to
      // 100MB) — otherwise Next.js's own body-size guard rejects the
      // request with a raw platform-level error before that action's
      // validation ever runs, surfacing as a broken page instead of a
      // clean "File must be under 100 MB" message.
      bodySizeLimit: "100mb",
    },
  },
  async redirects() {
    return [
      // Legacy URL redirects (permanent 301)
      { source: "/admin/organisations", destination: "/admin/clients", permanent: true },
      { source: "/admin/organisations/:path*", destination: "/admin/clients/:path*", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        // Non-CSP security headers, applied to all routes. CSP itself is
        // handled separately (report-only, via per-request nonces in
        // proxy.ts) — do not add Content-Security-Policy here.
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

// Wraps the config to upload source maps and inject release/tracing config
// at build time. No-ops safely without SENTRY_AUTH_TOKEN/SENTRY_ORG/
// SENTRY_PROJECT set (upload is skipped, a warning is logged) — safe to ship
// ahead of real Sentry credentials existing.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Source maps are uploaded to Sentry then deleted from the client bundle —
  // stack traces stay readable in Sentry without shipping maps to end users.
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  silent: !process.env.CI,
  webpack: {
    treeshake: { removeDebugLogging: true },
  },

  // Routes /monitoring through this app instead of a direct browser->Sentry
  // request, so ad-blockers that block Sentry's ingest domain don't silently
  // drop client-side error reports.
  tunnelRoute: "/monitoring",
});
