import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { apiFetch, ApiFetchError, redirectIfSessionExpired } from "@/lib/api-server"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import type { JingleList } from "@/interfaces/JingleList"
import { JinglesView } from "./JinglesView"

export const metadata: Metadata = { title: "Jingles" }

export default async function JinglesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let station: Station
  let jingles: { data: Track[]; meta: LibraryMeta }
  let lists: JingleList[]

  try {
    // Jingles are `tracks` rows with kind "jingle", each in one of the
    // station's jingle lists; the lists carry the rules.
    const [stationRes, jinglesRes, listsRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      apiFetch<{ data: Track[]; meta: LibraryMeta }>(`/stations/${slug}/tracks?kind=jingle`),
      apiFetch<{ data: JingleList[] }>(`/stations/${slug}/jingle-lists`),
    ])
    station = stationRes.data
    jingles = jinglesRes
    lists = listsRes.data
  } catch (err) {
    redirectIfSessionExpired(err)
    if (err instanceof ApiFetchError && (err.status === 404 || err.status === 403)) {
      notFound()
    }
    console.error(`[jingles/${slug}] fetch failed:`, err)
    throw err
  }

  return <JinglesView station={station} initialLists={lists} initialJingles={jingles.data} initialMeta={jingles.meta} />
}
