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
  // The Salesforce CLI is spawned as a child process, so the tracer can't see it. Ship it only with
  // the routes that run it: it's large, and every other route should stay small and cold-start fast.
  // Add a route here when it starts calling withStoredOrg.
  outputFileTracingIncludes: {
    "/customers/*/integrations/salesforce": ["./sf-cli/node_modules/**/*"],
    "/customers/*/integrations/salesforce/connect": ["./sf-cli/node_modules/**/*"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
