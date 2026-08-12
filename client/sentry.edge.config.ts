// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// See sentry.server.config.ts for why this is dev-gated.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (process.env.NODE_ENV === "production" && dsn) {
  Sentry.init({
    dsn,

    // Sample 20% of edge transactions in production to stay within free-tier quota.
    tracesSampleRate: 0.2,

    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Disable sending user PII (Personally Identifiable Information).
    // Privacy policy commits to "no personal data is intentionally sent" to Sentry.
    sendDefaultPii: false,
  });
}
