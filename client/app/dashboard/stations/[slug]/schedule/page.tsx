import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { apiFetch, ApiFetchError, redirectIfSessionExpired } from "@/lib/api-server"
import type { Playlist } from "@/interfaces/Playlist"
import type { Station } from "@/interfaces/Station"
import { SchedulePlanner } from "./SchedulePlanner"

// Its own tab title: every dashboard tab used to read the marketing title,
// so history and open tabs were indistinguishable.
export const metadata: Metadata = { title: "Schedule" }

export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let station: Station
  let playlists: Playlist[]

  try {
    // The station fetch carries the slots and the resolved programme; the
    // playlists are what the slot dropdown offers.
    const [stationRes, playlistsRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      apiFetch<{ data: Playlist[] }>(`/stations/${slug}/playlists`),
    ])
    station = stationRes.data
    playlists = playlistsRes.data
  } catch (err) {
    redirectIfSessionExpired(err)
    if (err instanceof ApiFetchError && (err.status === 404 || err.status === 403)) {
      notFound()
    }
    console.error(`[schedule/${slug}] fetch failed:`, err)
    throw err
  }

  // AutoDJ slots only. Show times and the station timezone are edited in
  // Station settings and drawn here read-only — see SchedulePlanner.
  return (
    // Full width, like Library and Audience: the week calendar needs the
    // room, and the slot panel sits beside it on large screens. The heading
    // is the planner's, so the save state can sit next to it.
    <div>
      <SchedulePlanner station={station} playlists={playlists} />
    </div>
  )
}
