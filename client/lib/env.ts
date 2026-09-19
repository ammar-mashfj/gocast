/**
 * Centralized environment configuration.
 *
 * IMPORTANT: Each env var must be accessed as a literal string
 * (e.g. process.env.NEXT_PUBLIC_API_URL) — not via dynamic key lookup.
 * Turbopack/Next.js performs static string replacement at compile time
 * and cannot inline dynamically accessed keys.
 */

export const env = {
  /** Laravel API base URL (e.g. http://localhost:8000/api) */
  get apiUrl(): string {
    // Server-side fetches (Next.js runtime in Docker) prefer the internal
    // service-name URL so they don't try to reach the host's published port
    // from inside the client container.
    if (typeof window === "undefined" && process.env.INTERNAL_API_URL) {
      return process.env.INTERNAL_API_URL
    }
    return process.env.NEXT_PUBLIC_API_URL ?? ""
  },
  /** Public app URL for links and OG tags (e.g. http://localhost:3000) */
  get appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL ?? ""
  },
  /** Icecast server URL for stream playback (e.g. http://localhost:8888) */
  get icecastUrl(): string {
    return process.env.NEXT_PUBLIC_ICECAST_URL ?? ""
  },

  /**
   * Ably's app key, over the Pusher protocol.
   *
   * Empty is meaningful, not a misconfiguration: it is the CLIENT-SIDE KILL
   * SWITCH. `lib/echo.ts` returns null when this is unset and every hook falls
   * through to the polling it already does, so the whole feature reverts by
   * removing one variable — no code deploy, and independent of the server's
   * own switch (BROADCAST_CONNECTION).
   */
  get broadcastKey(): string {
    return process.env.NEXT_PUBLIC_PUSHER_KEY ?? ""
  },
  /** Ably's Pusher-protocol host: main.pusher.ably.net (realtime-pusher.ably.io is a CNAME to it) */
  get broadcastHost(): string {
    return process.env.NEXT_PUBLIC_PUSHER_HOST ?? ""
  },
  get broadcastPort(): number {
    return Number(process.env.NEXT_PUBLIC_PUSHER_PORT ?? 443)
  },
  /**
   * Where Echo signs a private subscription.
   *
   * Its own variable rather than something derived from `apiUrl`, which
   * already ends in `/api` — `/broadcasting/auth` is a SIBLING of that path,
   * not a child, so building it would mean stripping a suffix off a URL whose
   * shape differs between hybrid dev, LAN device testing and production.
   * That string surgery is exactly how those setups break.
   */
  get broadcastAuthUrl(): string {
    return process.env.NEXT_PUBLIC_BROADCAST_AUTH_URL ?? ""
  },
} as const
