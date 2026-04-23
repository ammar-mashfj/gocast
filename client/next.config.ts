import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const nextConfig: NextConfig = {
  /* Production optimizations */
  compress: true,
  // Emits a self-contained .next/standalone directory with only the files
  // the server actually needs at runtime — lets the prod Docker image copy
  // ~30 MB instead of the full node_modules tree (~600 MB). Ignored in dev.
  output: "standalone",
  deploymentId: process.env.NEXT_DEPLOYMENT_ID,
  images: {
    formats: ["image/avif", "image/webp"],
    // Allow loopback/private IPs as upstream image hosts in development —
    // Next's optimizer SSRF-protects against private IPs by default, which
    // would otherwise block fetching artwork from `localhost:8000` during
    // local dev. In production the API lives on a public domain so this
    // guard naturally re-engages.
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
    // Per the Next.js docs example, every field is explicit. `pathname: "/**"`
    // matches any path; the empty `search` forbids query strings (Laravel
    // storage URLs don't use them).
    remotePatterns: [
      // Production API — station artwork uploads (served from /storage)
      {
        protocol: "https",
        hostname: "api.gocast.fm",
        port: "",
        pathname: "/storage/**",
        search: "",
      },
      // Google profile photos for OAuth-signup user avatars
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        port: "",
        pathname: "/**",
        search: "",
      },
      // Local dev — Laravel API
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
        pathname: "/storage/**",
        search: "",
      },
    ],
  },
  async rewrites() {
    // Dev-only: route /stream-proxy/* to the local Icecast so the browser avoids
    // CORS preflight (stock Icecast 2.x does not answer OPTIONS). In prod, nginx
    // fronts Icecast and NEXT_PUBLIC_ICECAST_URL points at that host directly.
    if (process.env.NODE_ENV !== "development") return []
    return [
      { source: "/stream-proxy/:path*", destination: "http://localhost:8888/:path*" },
    ]
  },
  async redirects() {
    return [
      // Discover is hidden until there's enough live-station volume to make
      // the page feel useful — a mostly-empty grid hurts first-impression
      // conversion. Temporary (307) so search engines keep the URL indexed
      // for when we re-enable it. The `app/discover/*` files are left in
      // place so flipping this back on is a one-entry revert.
      { source: "/discover", destination: "/", permanent: false },
    ]
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ]
  },
};

export default withSentryConfig(withBundleAnalyzer(nextConfig), {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "gocast",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
