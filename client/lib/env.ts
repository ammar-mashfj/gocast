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
  /**
   * MediaMTX WHIP base URL (e.g. http://localhost:8889). The full per-station
   * endpoint is ${whipUrl}/${slug}/live/whip — slug + "/live" is the MediaMTX
   * path, "/whip" is the WHIP suffix MediaMTX adds.
   */
  get whipUrl(): string {
    return process.env.NEXT_PUBLIC_WHIP_URL ?? ""
  },
  /** Icecast server URL for stream playback (e.g. http://localhost:8888) */
  get icecastUrl(): string {
    return process.env.NEXT_PUBLIC_ICECAST_URL ?? ""
  },
} as const
