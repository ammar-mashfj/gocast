"use client"

import Echo from "laravel-echo"
import Pusher from "pusher-js"
import { env } from "./env"

/**
 * The app's single websocket connection.
 *
 * Ably, spoken to with the PUSHER client — `pusher-js` and stock
 * `laravel-echo`, not `@ably/laravel-echo` (a fork) and `ably-js`. Reverb
 * speaks the same protocol, so moving off Ably later changes the four values
 * below and nothing else; the bundle does not change packages at all.
 *
 * Returns null, rather than throwing or constructing a broken client, when
 * the key is unset. That is the kill switch: every caller treats null as
 * "no push available" and keeps polling exactly as it does today.
 */

type EchoClient = Echo<"pusher">

let client: EchoClient | null = null
/** Distinguishes "not built yet" from "built, and the answer was null". */
let initialised = false

export function getEcho(): EchoClient | null {
  // A singleton module variable is per-tab, not per-render, so this survives
  // React remounts and every hook shares one socket. Ably's free tier counts
  // CONNECTIONS, and a connection per hook would spend the 200-connection
  // ceiling on a handful of users.
  if (initialised) {
    return client
  }

  initialised = true

  // Echo reaches for `window` and opens a socket on construction, so it must
  // never run during SSR or in a server component's render.
  if (typeof window === "undefined") {
    return null
  }

  if (!env.broadcastKey || !env.broadcastAuthUrl) {
    return null
  }

  client = new Echo({
    broadcaster: "pusher",
    Pusher,
    key: env.broadcastKey,
    // Ably has no clusters. The pusher client demands one anyway and ignores
    // it once wsHost is explicit.
    cluster: "mt1",
    wsHost: env.broadcastHost,
    wsPort: env.broadcastPort,
    wssPort: env.broadcastPort,
    forceTLS: true,
    enabledTransports: ["ws", "wss"],

    /*
     * Signing a private subscription, by hand.
     *
     * pusher-js's built-in auth transport cannot send cookies: its
     * InternalAuthOptions has params and headers and nothing else, and the
     * XHR it builds does not set withCredentials. Our whole browser auth IS a
     * cookie — `token`, which Laravel's UseAuthTokenCookie turns into the
     * bearer header Sanctum reads — so the built-in transport would send an
     * unauthenticated request and every private channel would 401.
     *
     * `credentials: "include"` is the fix and the only reason this block
     * exists. It also needs `broadcasting/auth` listed in the API's
     * config/cors.php paths (it is a sibling of `api/*`, not a child, so the
     * wildcard does not reach it) and supports_credentials true, which it
     * already is.
     */
    channelAuthorization: {
      transport: "ajax",
      endpoint: env.broadcastAuthUrl,
      customHandler: async (
        { socketId, channelName }: { socketId: string; channelName: string },
        callback: (error: Error | null, data: { auth: string } | null) => void,
      ) => {
        try {
          const response = await fetch(env.broadcastAuthUrl, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ socket_id: socketId, channel_name: channelName }),
          })

          if (!response.ok) {
            // Hand pusher-js the error rather than throwing past it. It
            // retries the subscription on its own schedule, and a rejected
            // channel must not take the shared socket down with it — the
            // notification bell and every other station ride on the same one.
            throw new Error(`broadcasting/auth responded ${response.status}`)
          }

          callback(null, await response.json())
        } catch (error) {
          callback(error instanceof Error ? error : new Error(String(error)), null)
        }
      },
    },
  })

  patchNullHandshakeAction(client)

  return client
}

/**
 * Give pusher-js a callback for the handshake action it cannot name.
 *
 * A `pusher:error` during the handshake whose code is below 4000 (bar
 * 1002–1004), or missing, maps to action `null`, and pusher-js then calls
 * `handshakeCallbacks[null]` — "this.handshakeCallbacks[n.action] is not a
 * function" in Sentry. The throw lands after the connecting runner is aborted
 * and before a retry is scheduled, so the tab's socket is dead until reload.
 * pusher-js's own close-event path already treats a null action as
 * `backoff`; this applies the same default to the message path. Indexing by
 * null coerces to the string "null", hence the key.
 */
function patchNullHandshakeAction(echo: EchoClient) {
  const manager = echo.connector?.pusher?.connection as unknown as
    | { handshakeCallbacks?: Record<string, (handshake: unknown) => void> }
    | undefined
  const callbacks = manager?.handshakeCallbacks

  if (callbacks?.backoff) {
    callbacks.null ??= callbacks.backoff
    callbacks.undefined ??= callbacks.backoff
  }
}

/**
 * Is the socket currently carrying messages?
 *
 * Hooks use this to decide how hard to poll, so it has to answer "no" for
 * every not-yet-connected state as well as for a dropped one — being
 * optimistic here means a dashboard that has gone quiet also stops polling,
 * which is the one failure this design exists to avoid.
 */
export function echoConnected(echo: EchoClient | null): boolean {
  return echo?.connector?.pusher?.connection?.state === "connected"
}
