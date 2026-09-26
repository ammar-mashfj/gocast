import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { apiFetch, ApiFetchError } from "@/lib/api-server"
import type { Playlist } from "@/interfaces/Playlist"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"
import { LibraryView } from "./LibraryView"

// Its own tab title: every dashboard tab used to read the marketing title,
// so history and open tabs were indistinguishable.
export const metadata: Metadata = { title: "AutoDJ" }

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  let station: Station
  let initialTracks: Track[]
  let meta: LibraryMeta
  let playlists: Playlist[]

  try {
    const [stationRes, tracksRes, playlistsRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      apiFetch<{ data: Track[]; meta: LibraryMeta }>(`/stations/${slug}/tracks`),
      apiFetch<{ data: Playlist[] }>(`/stations/${slug}/playlists`),
    ])
    station = stationRes.data
    initialTracks = tracksRes.data
    meta = tracksRes.meta
    playlists = playlistsRes.data
  } catch (err) {
    if (err instanceof ApiFetchError && err.status === 404) {
      notFound()
    }
    console.error(`[library/${slug}] fetch failed:`, err)
    throw err
  }

  // No back link: the sidebar's AutoDJ item and the header breadcrumb both
  // already lead back to the station.
  return (
    <div>
      {/* Heading, tabs and the count/runtime/storage line live inside
          LibraryView: the line changes on every upload, delete and tag edit,
          so it has to be rendered from the same client state as the list
          itself, and the tabs sit between it and the heading. */}
      <LibraryView
        station={station}
        initialTracks={initialTracks}
        initialMeta={meta}
        initialPlaylists={playlists}
      />
    </div>
  )
}
