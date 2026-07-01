import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  async redirects() {
    return [
      // Legacy URL redirects (permanent 301)
      { source: "/admin/organisations", destination: "/admin/clients", permanent: true },
      { source: "/admin/organisations/:path*", destination: "/admin/clients/:path*", permanent: true },
    ];
  },
};

export default nextConfig;
