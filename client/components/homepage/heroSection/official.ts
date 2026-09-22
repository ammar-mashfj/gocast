/*
 * Plain module, deliberately — same reason as ./uptime.ts. This is imported by
 * HeroSection (a server component) AND by HeroStationPlayer (a client one), so
 * it must not carry "use client": every export of a client module becomes a
 * client reference, and reading one on the server throws.
 */

/**
 * The one station the homepage plays. A constant rather than an env var: it is
 * not deployment-specific, and a homepage that silently renders a different
 * station per environment is harder to reason about than one that names it.
 *
 * Shared so the player can link to the station page without waiting on the API
 * to tell it a slug it already knows — the same reasoning that keeps the HLS
 * URL a constant. A hero whose only outbound link disappears when the backend
 * blinks is worse than one that occasionally points at an off-air station.
 */
export const OFFICIAL_SLUG = 'gocast-official-station'
