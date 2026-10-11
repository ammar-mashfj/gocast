import { notFound } from "next/navigation"
import { apiFetch, ApiFetchError, redirectIfSessionExpired } from "@/lib/api-server"
import type { Playlist } from "@/interfaces/Playlist"
import type { Station } from "@/interfaces/Station"
import type { Track, LibraryMeta } from "@/interfaces/Track"

/**
 * What Library and Playlists both render from: the station, every track and
 * every playlist. Both pages need all three — Library names each track's
 * playlists, Playlists adds tracks from the library.
 */
export async function loadLibrary(slug: string) {
  try {
    const [stationRes, tracksRes, playlistsRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      apiFetch<{ data: Track[]; meta: LibraryMeta }>(`/stations/${slug}/tracks`),
      apiFetch<{ data: Playlist[] }>(`/stations/${slug}/playlists`),
    ])
    return {
      station: stationRes.data,
      initialTracks: tracksRes.data,
      initialMeta: tracksRes.meta,
      initialPlaylists: playlistsRes.data,
    }
  } catch (err) {
    redirectIfSessionExpired(err)
    if (err instanceof ApiFetchError && (err.status === 404 || err.status === 403)) {
      notFound()
    }
    console.error(`[library/${slug}] fetch failed:`, err)
    throw err
  }
}
