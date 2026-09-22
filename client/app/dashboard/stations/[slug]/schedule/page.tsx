import { notFound } from "next/navigation"
import Link from "next/link"
import { IconArrowLeft } from "@tabler/icons-react"
import { apiFetch, ApiFetchError } from "@/lib/api-server"
import type { Playlist } from "@/interfaces/Playlist"
import type { Station } from "@/interfaces/Station"
import { AutoDjTabs } from "@/components/dashboard/AutoDjTabs"
import { AutodjSlotsEditor } from "./AutodjSlotsEditor"
import { HelpLink } from "@/components/dashboard/HelpLink"

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

  return (
    <div>
      <Link
        href={`/dashboard/stations/${slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground no-underline hover:text-foreground transition-colors mb-6"
      >
        <IconArrowLeft size={14} />
        Back to {station.name}
      </Link>

      <AutoDjTabs slug={slug} />

      <div className="flex flex-col gap-2 mb-6">
        <h1 className="font-display flex items-center gap-2 text-2xl font-semibold">
          Schedule
          <HelpLink
            article="schedule-playlists-by-time"
            label="scheduling playlists by day and time"
          />
        </h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Play different playlists at different times of the week. This is separate from the show
          times on your settings page, which only tell listeners when you&apos;re live.
        </p>
      </div>

      <AutodjSlotsEditor station={station} playlists={playlists} />
    </div>
  )
}
