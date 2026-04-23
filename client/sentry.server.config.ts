// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://5f9d94673811eda011ed3d38d4eee134@o4511207716487169.ingest.de.sentry.io/4511238369837136",

  // Sample 20% of server transactions in production to stay within free-tier quota.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Disable sending user PII (Personally Identifiable Information).
  // Privacy policy commits to "no personal data is intentionally sent" to Sentry.
  sendDefaultPii: false,
});
