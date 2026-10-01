import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { apiFetch, ApiFetchError } from "@/lib/api-server"
import { env } from "@/lib/env"
import type { Station } from "@/interfaces/Station"
import type { StreamSession } from "@/interfaces/StreamSession"
import type { Playlist } from "@/interfaces/Playlist"
import { OverviewHeader } from "@/components/dashboard/overview/OverviewHeader"
import { OverviewHero } from "@/components/dashboard/overview/OverviewHero"
import { YourLinkCard } from "@/components/dashboard/overview/YourLinkCard"
import { ComingUpCard } from "@/components/dashboard/overview/ComingUpCard"
import { SetupChecklist } from "@/components/dashboard/overview/SetupChecklist"
import { LiveShowsCard } from "@/components/dashboard/overview/LiveShowsCard"
import { RecentShowsCard } from "@/components/dashboard/overview/RecentShowsCard"

// Its own tab title, so history and open tabs are told apart.
export const metadata: Metadata = { title: "Overview" }

/**
 * The station overview: who the station is, what's on air (and the controls
 * that change it), how to hand out the link, what's next, what's left to set
 * up, and how the shows have gone. Layout from the dashboard prototype
 * (docs/design/dashboard-prototype); decisions in
 * docs/DASHBOARD-DESIGN-SYSTEM-ROLLOUT.md (R5.1).
 */
export default async function StationOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let station: Station
  let sessions: StreamSession[]
  let sessionTotal: number
  let playlists: Playlist[] | null
  try {
    const [stationRes, sessionsRes, playlistsRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      apiFetch<{ data: StreamSession[]; total?: number }>(`/stations/${slug}/sessions`),
      // Only for the checklist's "fill AutoDJ's playlist". Not worth failing
      // the page over: without it, that one item is left out.
      apiFetch<{ data: Playlist[] }>(`/stations/${slug}/playlists`)
        .then((res) => res.data)
        .catch((err) => {
          console.error(`[station/${slug}] playlist fetch failed:`, err)
          return null
        }),
    ])
    station = stationRes.data
    sessions = sessionsRes.data
    sessionTotal = sessionsRes.total ?? sessionsRes.data.length
    playlists = playlistsRes
  } catch (err) {
    if (err instanceof ApiFetchError && (err.status === 404 || err.status === 403)) notFound()
    console.error(`[station/${slug}] fetch failed:`, err)
    throw err
  }

  const lastLive = sessions.find((s) => s.ended_at)?.ended_at ?? null
  // The playlist AutoDJ plays when nothing is scheduled. Unknown (fetch
  // failed) counts as filled, so the checklist never nags about a playlist
  // it couldn't see.
  const defaultTracks = playlists ? (playlists.find((p) => p.is_default)?.track_count ?? 0) : 1

  return (
    <div className="flex flex-col gap-5">
      <OverviewHeader station={station} lastLive={lastLive} />
      <OverviewHero station={station} />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,21rem),1fr))] gap-5">
        <YourLinkCard url={`${env.appUrl}/station/${station.slug}`} appUrl={env.appUrl} slug={station.slug} stationName={station.name} />
        <ComingUpCard station={station} />
      </div>

      <SetupChecklist
        station={station}
        trackCount={defaultTracks}
        hasListeners={station.stats?.has_listeners ?? (station.stats?.peak_listeners ?? 0) > 0}
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))] items-start gap-5">
        <LiveShowsCard sessions={sessions} truncated={sessionTotal > sessions.length} />
        <RecentShowsCard sessions={sessions} timeZone={station.timezone} />
      </div>
    </div>
  )
}
