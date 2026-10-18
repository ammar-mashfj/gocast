import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { apiFetch, ApiFetchError, redirectIfSessionExpired } from "@/lib/api-server"
import { env } from "@/lib/env"
import type { Station } from "@/interfaces/Station"
import type { StreamSession } from "@/interfaces/StreamSession"
import { OverviewHero } from "@/components/dashboard/overview/OverviewHero"
// YourLinkCard is off too: the link is in the hero now (OverviewHeader:
// Copy player link, QR code & embed, Open ↗).
// ComingUpCard (components/dashboard/overview) is off for now; kept to bring back.
// ShowsLinks (Recent shows) is off too: the sidebar has Live history, and
// under the hero is the Pro offer's alone.
import { OverviewBelow } from "@/components/dashboard/overview/OverviewBelow"

// Its own tab title, so history and open tabs are told apart.
export const metadata: Metadata = { title: "Overview" }

/**
 * The station overview: who the station is and what's on air (one hero, with
 * the controls that change it), how to hand out the link, and
 * where the shows went. What's left to set up lives in the top bar (SetupMenu). Layout
 * from the dashboard prototype (docs/design/dashboard-prototype); decisions in
 * docs/DASHBOARD-DESIGN-SYSTEM-ROLLOUT.md (R5.1).
 */
export default async function StationOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  let station: Station
  let sessions: StreamSession[]
  try {
    const [stationRes, sessionsRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      apiFetch<{ data: StreamSession[] }>(`/stations/${slug}/sessions`),
    ])
    station = stationRes.data
    sessions = sessionsRes.data
  } catch (err) {
    // A 401 is a stale cookie and goes to the login page.
    redirectIfSessionExpired(err)
    if (err instanceof ApiFetchError && (err.status === 404 || err.status === 403)) notFound()
    console.error(`[station/${slug}] fetch failed:`, err)
    throw err
  }

  const lastLive = sessions.find((s) => s.ended_at)?.ended_at ?? null

  return (
    <div className="flex flex-col gap-5">
      <OverviewHero station={station} lastLive={lastLive} appUrl={env.appUrl} />

      <OverviewBelow />
    </div>
  )
}
