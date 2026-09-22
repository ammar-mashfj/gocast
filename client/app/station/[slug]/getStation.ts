import { cache } from "react"
import type { Station } from "@/interfaces/Station"
import { env } from "@/lib/env"
import { publicApiHeaders } from "@/lib/public-api"

/**
 * One station from the public API, for the player page and its share image.
 *
 * Null means ONE thing: the API said 404, so the station does not exist and
 * the page should be a real 404. Anything else — a 5xx, a 429, a timeout —
 * throws, so the page errors with a 5xx.
 *
 * That distinction is the difference between "come back later" and "this is
 * gone" to a search engine. Both used to return null, so a moment of API
 * trouble served Googlebot a 404 for every station it tried, and a 404 is
 * how a page gets dropped from the index. A 5xx gets retried.
 *
 * `cache` so generateMetadata and the page share one request per render.
 */
export const getStation = cache(async (slug: string): Promise<Station | null> => {
  // Dev: undici holds keep-alive sockets longer than FrankenPHP keeps them
  // alive, so the first attempt after an idle window hits a half-closed
  // socket and ConnectTimeouts at 10s. Second attempt opens a fresh socket
  // and lands in <200ms. In prod a real LB in front of the api hides this.
  const isDev = process.env.NODE_ENV === "development"
  const attempts = isDev ? 2 : 1

  for (let i = 0; ; i++) {
    let res: Response
    try {
      res = await fetch(`${env.apiUrl}/public/stations/${encodeURIComponent(slug)}`, {
        headers: publicApiHeaders(),
        signal: isDev ? AbortSignal.timeout(3000) : undefined,
        ...(isDev ? { cache: "no-store" as const } : { next: { revalidate: 60 } }),
      })
    } catch (err) {
      // Earlier attempts retry the stale-socket case; the last one gives up
      // loudly. A plain Error, not the DOMException a timeout rejects with —
      // see ApiTimeoutError in lib/api-server.ts for why that matters here.
      if (i < attempts - 1) continue
      throw new Error(`Station fetch failed for "${slug}"`, { cause: err })
    }

    if (res.status === 404) return null
    if (!res.ok) throw new Error(`Station fetch for "${slug}" answered ${res.status}`)

    const json = await res.json()
    return json.data
  }
})
