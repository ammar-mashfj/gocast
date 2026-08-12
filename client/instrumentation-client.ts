// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// See sentry.server.config.ts for why this is dev-gated.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (process.env.NODE_ENV === "production" && dsn) {
  Sentry.init({
    dsn,

    // Add optional integrations for additional features
    integrations: [Sentry.replayIntegration()],

    // Sample 20% of client transactions in production to stay within free-tier quota.
    tracesSampleRate: 0.2,
    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Replay quota burns fast on launch traffic — keep sampling low to
    // preserve free-tier headroom.
    replaysSessionSampleRate: 0.02,
    replaysOnErrorSampleRate: 0.5,

    // Disable sending user PII (Personally Identifiable Information).
    // Privacy policy commits to "no personal data is intentionally sent" to Sentry.
    sendDefaultPii: false,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
