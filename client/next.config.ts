import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

// The RFC1918 ranges, plus mDNS names. Note the matcher only treats a whole
// dot-separated segment as a wildcard — "172.1*.*.*" matches nothing — so the
// second octet of 172.16.0.0/12 has to be spelled out.
const LAN_DEV_ORIGINS = [
  "10.*.*.*",
  "192.168.*.*",
  ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
  "*.local",
];

const nextConfig: NextConfig = {
  // Pin the workspace root to this directory.
  //
  // Turbopack otherwise infers the root by walking up looking for lockfiles,
  // and any stray package-lock.json in a parent directory (a home directory
  // is a common one) wins. It then tries to watch that whole tree, which
  // fails outright with "An IO error occurred while attempting to create and
  // acquire the lockfile / Permission denied" the moment it hits a directory
  // it can't read. Inside the container there is nothing above /app to find,
  // so this only bites when running `next dev` natively on a host.
  turbopack: {
    root: __dirname,
  },

  // Next 16 blocks cross-origin requests to dev-only resources (/_next/*,
  // /__nextjs*, the HMR websocket) unless the requesting host is allowlisted;
  // only `localhost` and the hostname the server was started with are allowed
  // by default. Opening the dev server from a phone or tablet on the LAN
  // (http://192.168.x.x:3000) therefore serves the SSR HTML fine but 403s
  // every client chunk, so the page never hydrates and every button on it is
  // dead — silently, unless you have the device's console open.
  //
  // Note `next dev --hostname 0.0.0.0` does NOT help: the hostname Next
  // allowlists is the literal "0.0.0.0", never the interface address the
  // device actually typed.
  //
  // These are the RFC1918 ranges plus mDNS names, so any device on the local
  // network can reach it. Development-only — Next ignores this in a
  // production build, and nothing here widens the deployed surface.
  allowedDevOrigins: LAN_DEV_ORIGINS,

  /* Production optimizations */
  compress: true,
  // Emits a self-contained .next/standalone directory with only the files
  // the server actually needs at runtime — lets the prod Docker image copy
  // ~30 MB instead of the full node_modules tree (~600 MB). Ignored in dev.
  output: "standalone",
  images: {
    formats: ["image/avif", "image/webp"],
    // In dev (Docker): the artwork URL stored in the DB is
    // http://localhost:8000/storage/... which is fine for the browser but
    // resolves to the *client container itself* when Next's image optimizer
    // (running inside that container) tries to fetch upstream — net result:
    // 500s on every image. Skipping optimization in dev avoids the round
    // trip; the browser loads the original URL directly.
    unoptimized: process.env.NODE_ENV === "development",
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
      // Production API — station artwork uploads (served from /storage).
      //
      // Next's image optimizer rejects any host not listed here, so on a
      // different domain EVERY piece of station artwork 400s while the files
      // are plainly there. Derived from NEXT_PUBLIC_API_URL so it follows the
      // deployment instead of having to be hand-edited; the literal below is
      // only the fallback for a build with no env set.
      {
        protocol: "https",
        hostname: (() => {
          try {
            return new URL(process.env.NEXT_PUBLIC_API_URL ?? "").hostname
          } catch {
            return "api.gocast.fm"
          }
        })(),
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
    // 8888, not 8000: in dev the API holds 8000 (php artisan serve) and
    // Icecast is moved out of its way. A wrong default here does not fail
    // loudly — it proxies the audio request to Laravel, which answers a
    // perfectly valid 404 HTML page that looks like a missing stream.
    const icecastOrigin = process.env.INTERNAL_ICECAST_URL ?? "http://127.0.0.1:8888"
    return [
      { source: "/stream-proxy/:path*", destination: `${icecastOrigin}/:path*` },
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
      // Roadmap is hidden until it's rewritten against what actually shipped —
      // it still listed AutoDJ as "coming soon". Same one-entry revert as
      // discover; app/(marketing)/roadmap/page.tsx is the belt-and-braces stub.
      { source: "/roadmap", destination: "/", permanent: false },
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
