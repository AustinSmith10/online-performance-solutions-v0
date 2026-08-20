import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
