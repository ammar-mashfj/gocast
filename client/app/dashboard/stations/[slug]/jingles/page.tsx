import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { apiFetch, ApiFetchError, redirectIfSessionExpired } from "@/lib/api-server"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { JinglesView } from "./JinglesView"

export const metadata: Metadata = { title: "Jingles" }

export default async function JinglesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let station: Station
  let jingles: { data: Track[]; meta: LibraryMeta }
  try {
    // The station carries the jingle settings; the tracks call, with
    // kind=jingle, the clips and the station's storage (one cap for both).
    const [stationRes, jinglesRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      apiFetch<{ data: Track[]; meta: LibraryMeta }>(`/stations/${slug}/tracks?kind=jingle`),
    ])
    station = stationRes.data
    jingles = jinglesRes
  } catch (err) {
    redirectIfSessionExpired(err)
    if (err instanceof ApiFetchError && (err.status === 404 || err.status === 403)) notFound()
    console.error(`[jingles/${slug}] fetch failed:`, err)
    throw err
  }

  return <JinglesView station={station} initialJingles={jingles.data} initialMeta={jingles.meta} />
}
