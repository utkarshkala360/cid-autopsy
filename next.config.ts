import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Keep visited pages in the browser's router cache for 30s so going back and forth is instant.
    // Every mutation calls revalidatePath, which clears it, so your own changes show immediately.
    staleTimes: { dynamic: 30 },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // CallAnchor Config was renamed CallAnchor (owner, 2026-11-13); old links and saved audit-note
  // URLs still land on the right page.
  async redirects() {
    return [
      { source: "/dashboard/call_anchor_config", destination: "/dashboard/call_anchor", permanent: true },
      { source: "/dashboard/call_anchor_config/:path*", destination: "/dashboard/call_anchor/:path*", permanent: true },
      // Customers was removed: CallAnchor clients are the customers (owner, 2026-11-13).
      { source: "/customers", destination: "/dashboard/call_anchor/health", permanent: false },
      { source: "/customers/:path*", destination: "/dashboard/call_anchor/health", permanent: false },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
