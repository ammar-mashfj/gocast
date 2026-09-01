import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import { apiFetch, ApiFetchError } from "@/lib/api-server"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { LibraryView } from "./LibraryView"

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  let station: Station
  let initialTracks: Track[]
  let meta: LibraryMeta

  try {
    const [stationRes, tracksRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      apiFetch<{ data: Track[]; meta: LibraryMeta }>(`/stations/${slug}/tracks`),
    ])
    station = stationRes.data
    initialTracks = tracksRes.data
    meta = tracksRes.meta
  } catch (err) {
    if (err instanceof ApiFetchError && err.status === 404) {
      notFound()
    }
    console.error(`[library/${slug}] fetch failed:`, err)
    throw err
  }

  return (
    <div>
      <Link
        href={`/dashboard/stations/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline hover:text-foreground transition-colors mb-6"
      >
        <IconArrowLeft size={14} />
        Back to {station.name}
      </Link>

      {/* Heading and the count/runtime/storage line live inside LibraryView:
          they change on every upload, delete and tag edit, so they have to be
          rendered from the same client state as the list itself. */}
      <LibraryView station={station} initialTracks={initialTracks} initialMeta={meta} />
    </div>
  )
}
