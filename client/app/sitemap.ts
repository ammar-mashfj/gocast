import type { MetadataRoute } from "next"
import { env } from "@/lib/env"
import { Station } from "@/interfaces/Station"

export const revalidate = 3600

async function getPublicStations(): Promise<Station[]> {
  try {
    const res = await fetch(`${env.apiUrl}/public/featured`, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env.appUrl
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ]

  const stations = await getPublicStations()
  const stationRoutes: MetadataRoute.Sitemap = stations.map((s) => ({
    url: `${base}/station/${s.slug}`,
    lastModified: now,
    changeFrequency: "hourly",
    priority: 0.8,
  }))

  return [...staticRoutes, ...stationRoutes]
}
