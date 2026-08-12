// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// Skip Sentry in dev — full-sample telemetry plus an unreachable ingest
// endpoint from inside the Docker container produces non-stop ETIMEDOUT
// noise. Real dev errors land in the terminal anyway. Production telemetry
// is kept on for the real reporting use case.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (process.env.NODE_ENV === "production" && dsn) {
  Sentry.init({
    dsn,

    // Sample 20% of server transactions in production to stay within free-tier quota.
    tracesSampleRate: 0.2,

    // Enable logs to be sent to Sentry
    enableLogs: true,

    // Disable sending user PII (Personally Identifiable Information).
    // Privacy policy commits to "no personal data is intentionally sent" to Sentry.
    sendDefaultPii: false,
  });
}
