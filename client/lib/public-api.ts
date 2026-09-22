/**
 * Headers for the Next server's own fetches from the PUBLIC API — station
 * pages, the homepage rail, the sitemap.
 *
 * All of that traffic reaches the API from this one server, and the API
 * limits public endpoints to 60 requests a minute per address. The render
 * key (RENDER_API_KEY, the same value on both sides) lifts that limit for
 * us; without it, a crawler walking station pages quickly is served 429s.
 *
 * Server-only by construction: RENDER_API_KEY has no NEXT_PUBLIC_ prefix,
 * so it is never inlined into a browser bundle, and in a browser this simply
 * returns the Accept header.
 */
export function publicApiHeaders(): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" }
  const renderKey = process.env.RENDER_API_KEY
  if (renderKey) headers["X-Render-Key"] = renderKey
  return headers
}
