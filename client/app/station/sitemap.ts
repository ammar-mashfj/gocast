import type { MetadataRoute } from "next"
import { env } from "@/lib/env"
import { publicApiHeaders } from "@/lib/public-api"

/**
 * Station player pages, served at /station/sitemap.xml and listed in
 * robots.txt beside the site's own sitemap.
 *
 * Only stations that have made a sound at least once — the API decides
 * (Station::scopeIndexable), and the player page marks the rest noindex from
 * the same rule, so this file and the pages never disagree. Listing every row
 * put hundreds of never-started stations in front of Google: pages with a
 * name and nothing else, which drag the whole site's quality score down.
 *
 * One request to a dedicated endpoint. The old walk of the paginated
 * directory made up to a hundred calls under a live-first sort that
 * reshuffled as stations went on and off air mid-walk — skipping some,
 * listing others twice — and hit the public rate limit partway through.
 *
 * Rendered per request (the API response is still cached for an hour below)
 * rather than prerendered at build: a prerender fetches during `next build`,
 * and with the throw below an API that is down mid-deploy would fail the
 * whole deploy over a sitemap.
 */
export const dynamic = "force-dynamic"

interface SitemapStation {
  slug: string
  updated_at: string | null
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const res = await fetch(`${env.apiUrl}/public/sitemap/stations`, {
    headers: publicApiHeaders(),
    next: { revalidate: 3600 },
  })

  // Throw rather than return an empty list. An empty sitemap is a valid
  // answer that tells a crawler every station is gone; an error keeps the
  // last good copy in the cache and makes the crawler try again later.
  if (!res.ok) throw new Error(`Stations sitemap: API answered ${res.status}`)

  const { data }: { data: SitemapStation[] } = await res.json()

  return data.map((s) => ({
    url: `${env.appUrl}/station/${s.slug}`,
    ...(s.updated_at ? { lastModified: new Date(s.updated_at) } : {}),
    changeFrequency: "daily",
    priority: 0.8,
  }))
}
