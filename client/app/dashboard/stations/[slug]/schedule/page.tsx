import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { apiFetch, ApiFetchError } from "@/lib/api-server"
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
    if (err instanceof ApiFetchError && err.status === 404) {
      notFound()
    }
    console.error(`[schedule/${slug}] fetch failed:`, err)
    throw err
  }

  // Its own sidebar item now, not a tab under AutoDJ: show times are on
  // every plan, and a Free station had to open a Pro page to reach them.
  return (
    <div className="sheet max-w-4xl">
      <div className="mb-8 flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-sm text-muted-foreground max-w-[62ch]">
          Your station&apos;s week: when you go live, and what AutoDJ plays the rest of the time.
        </p>
      </div>

      <SchedulePlanner station={station} playlists={playlists} />
    </div>
  )
}
