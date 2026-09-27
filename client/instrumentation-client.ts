// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// Browser page translation (Chrome's Google Translate) swaps React's text
// nodes for its own <font> wrappers. The next time React removes one of those
// text nodes, or inserts a sibling in front of one, the DOM throws
// NotFoundError and the page falls into the error boundary — Studio mid-show
// included. React won't fix this (facebook/react#11538), so these two methods
// skip the node Translate moved instead of throwing. The cost is translated
// text that can go stale; that beats an error screen while live.
// Not dev-gated: translated sessions are production sessions.
if (typeof Node === "function" && !(Node.prototype as { __translateSafe?: boolean }).__translateSafe) {
  (Node.prototype as { __translateSafe?: boolean }).__translateSafe = true;

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      console.warn("[translate-safe] skipped removeChild of a node moved by page translation", child);
      return child;
    }
    return removeChild.call(this, child) as T;
  };

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, child: Node | null): T {
    if (child && child.parentNode !== this) {
      // Append rather than drop: a spinner or panel landing at the end of its
      // parent is still visible, where skipping the insert would lose it.
      console.warn("[translate-safe] reference node was moved by page translation; appending instead", child);
      return insertBefore.call(this, node, null) as T;
    }
    return insertBefore.call(this, node, child) as T;
  };
}

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

    // Facebook/Instagram's Android in-app browser injects its own scripts
    // (app://navigation_performance_logger_android and friends) that call
    // into a Java bridge; on unload the bridge is torn down first and they
    // throw "Java object is gone". Not our code, nothing we can fix.
    //
    // Microsoft's Outlook/Defender Safe Links scanner opens emailed links in
    // a headless CefSharp browser and rejects a promise with "Object Not
    // Found Matching Id:N, MethodName:update" from its own .NET bridge. A
    // bot visiting a link from one of our emails, not a real user.
    denyUrls: [/^app:\/\//],
    ignoreErrors: [/Java object is gone/, /Object Not Found Matching Id:\d+/],
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
