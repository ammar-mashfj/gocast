import type { MetadataRoute } from "next"
import { env } from "@/lib/env"
import { Station } from "@/interfaces/Station"

export const revalidate = 3600

interface PaginatedStationsResponse {
  data: Station[]
  meta?: { current_page: number; last_page: number; total: number }
}

/**
 * Walk the paginated public-stations endpoint and return every station
 * so the sitemap covers the full catalog, not just the featured 4.
 *
 * Caps at ~100 pages (≈2400 stations with page size 24) as a safety net
 * so a malformed API response can't spin forever.
 */
async function getAllPublicStations(): Promise<Station[]> {
  const all: Station[] = []
  const PAGE_CAP = 100

  for (let page = 1; page <= PAGE_CAP; page++) {
    try {
      const res = await fetch(`${env.apiUrl}/public/stations?page=${page}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 3600 },
      })
      if (!res.ok) break
      const json: PaginatedStationsResponse = await res.json()
      if (!json.data?.length) break
      all.push(...json.data)
      if (!json.meta || page >= json.meta.last_page) break
    } catch {
      break
    }
  }

  return all
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/roadmap`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ]

  const stations = await getAllPublicStations()
  const stationRoutes: MetadataRoute.Sitemap = stations.map((s) => ({
    url: `${base}/station/${s.slug}`,
    lastModified: s.updated_at ? new Date(s.updated_at) : now,
    changeFrequency: "hourly",
    priority: 0.8,
  }))

  return [...staticRoutes, ...stationRoutes]
}
