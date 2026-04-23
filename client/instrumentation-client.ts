// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://5f9d94673811eda011ed3d38d4eee134@o4511207716487169.ingest.de.sentry.io/4511238369837136",

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Sample 20% of client transactions in production to stay within free-tier quota.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1,
  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Replay quota burns fast on launch traffic — keep sampling low in production
  // to preserve free-tier headroom; capture full sessions in development.
  replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.02 : 1.0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 0.5 : 1.0,

  // Disable sending user PII (Personally Identifiable Information).
  // Privacy policy commits to "no personal data is intentionally sent" to Sentry.
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
