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
    return process.env.NEXT_PUBLIC_API_URL ?? ""
  },
  /** Public app URL for links and OG tags (e.g. http://localhost:3000) */
  get appUrl(): string {
    return process.env.NEXT_PUBLIC_APP_URL ?? ""
  },
  /** WebSocket relay URL for broadcasting (e.g. ws://localhost:8080) */
  get wsUrl(): string {
    return process.env.NEXT_PUBLIC_WS_URL ?? ""
  },
  /** Icecast server URL for stream playback (e.g. http://localhost:8888) */
  get icecastUrl(): string {
    return process.env.NEXT_PUBLIC_ICECAST_URL ?? ""
  },
} as const
