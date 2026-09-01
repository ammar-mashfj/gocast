import { notFound } from "next/navigation"
import Link from "next/link"
import { IconExternalLink, IconSettings } from "@tabler/icons-react"
import { apiFetch, ApiFetchError } from "@/lib/api-server"
import { env } from "@/lib/env"
import { Station } from "@/interfaces/Station"
import { StreamSession } from "@/interfaces/StreamSession"
import { Track } from "@/interfaces/Track"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { StationArtwork } from "@/components/StationArtwork"
import { StationPower } from "@/components/dashboard/StationPower"
import { StationActivity } from "@/components/dashboard/StationActivity"
import { AutoDjRotation } from "@/components/dashboard/AutoDjRotation"
import { RecentBroadcasts } from "@/components/dashboard/RecentBroadcasts"
import { StationChecklist } from "@/components/dashboard/StationChecklist"
import { StationShare } from "@/components/dashboard/StationShare"
import { LiveListeners } from "@/components/dashboard/LiveListeners"
import { formatDate } from "@/lib/format"
import { StationActions } from "./StationActions"

/**
 * Every station encodes identically — it is hardcoded in the Liquidsoap
 * template (`%mp3(bitrate=128, samplerate=44100)`), not a per-station setting,
 * so there is nothing to read off the API. Stated here because "what quality
 * do my listeners get?" is a question the page should answer without anyone
 * having to ask support.
 */
const STREAM_FORMAT = "MP3 128 kbps"

export default async function StationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params

  let station: Station
  let sessions: StreamSession[]
  let sessionTotal: number
  let tracks: Track[]
  let tracksUnavailable: boolean

  // All three in one flight. The rotation used to be fetched AFTER this block
  // resolved, purely because its failure is handled differently — which put a
  // third round-trip in series in front of a page that already waits on two.
  // The different handling belongs in the catch, not in the ordering: a
  // failing track fetch degrades one card rather than taking the route down,
  // so it settles to an empty rotation instead of rejecting, and the
  // Promise.all only ever sees the two failures that are actually fatal.
  try {
    const [stationRes, sessionsRes, tracksRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      // Laravel's paginator, so `total` is what tells us whether the 14-day
      // window below is complete or merely the first page of a busy station.
      apiFetch<{ data: StreamSession[]; total?: number }>(`/stations/${slug}/sessions`),
      apiFetch<{ data: Track[] }>(`/stations/${slug}/tracks`)
        .then((res) => ({ tracks: res.data, unavailable: false }))
        .catch((err) => {
          console.error(`[station/${slug}] track fetch failed:`, err)
          return { tracks: [] as Track[], unavailable: true }
        }),
    ])
    station = stationRes.data
    sessions = sessionsRes.data
    sessionTotal = sessionsRes.total ?? sessionsRes.data.length
    tracks = tracksRes.tracks
    tracksUnavailable = tracksRes.unavailable
  } catch (err) {
    // Only render the 404 page when the backend actually said the station
    // is missing. Any other failure (timeout, 401 from a stale cookie, 5xx)
    // is a real error and must not be silently masked as "not found" — log
    // it and rethrow so Next.js surfaces it via the error boundary.
    if (err instanceof ApiFetchError && err.status === 404) {
      notFound()
    }
    console.error(`[station/${slug}] fetch failed:`, err)
    throw err
  }

  const playerUrl = `${env.appUrl}/station/${station.slug}`
  const lastEnded = sessions.find((s) => s.ended_at)?.ended_at ?? null

  // Header meta line. Each part is dropped rather than shown empty, so a brand
  // new station gets a short honest line instead of a row of dashes.
  const meta = [
    `Created ${formatDate(station.created_at)}`,
    STREAM_FORMAT,
    sessionTotal > 0 ? `${sessionTotal} broadcast${sessionTotal === 1 ? "" : "s"}` : null,
    station.state !== "offline"
      ? "On air now"
      : lastEnded
        ? `Last on air ${formatDate(lastEnded, "relative")}`
        : null,
  ].filter(Boolean) as string[]

  return (
    <div className="flex flex-col gap-6">
      {/* Header — identity and low-risk actions only. Anything that changes
          what listeners hear lives in the status panel below, so there is one
          place to look rather than two buttons that both mean "begin". */}
      <header className="flex flex-col gap-4 md:flex-row md:items-start md:gap-5">
        <StationArtwork
          src={station.artwork_url}
          alt={station.name}
          className="size-16 md:size-[72px] rounded-2xl shrink-0"
          iconSize={24}
          sizes="72px"
        />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-medium truncate">{station.name}</h1>
            {station.genre && (
              <Badge variant="secondary" className="shrink-0">{station.genre}</Badge>
            )}
          </div>
          {station.description && (
            <p className="text-sm text-muted-foreground max-w-xl line-clamp-2">
              {station.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {meta.map((part, i) => (
              <span key={part} className="inline-flex items-center gap-2">
                {i > 0 && <span className="text-border">•</span>}
                {part}
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" className="flex-1 md:flex-initial" asChild>
            <a href={`/station/${station.slug}`} target="_blank" rel="noopener noreferrer">
              <IconExternalLink data-icon="inline-start" />
              Player page
            </a>
          </Button>
          <StationActions station={station} mode="edit" />
          <Button variant="outline" size="icon" asChild title="Station settings">
            <Link href={`/dashboard/stations/${station.slug}/settings`}>
              <IconSettings />
              <span className="sr-only">Station settings</span>
            </Link>
          </Button>
        </div>
      </header>

      <div className="grid gap-6 items-start lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="flex flex-col gap-6 min-w-0">
          {/* Power, now playing, up next, listeners, and every action that
              changes any of them. */}
          <StationPower station={station} />

          <StationActivity
            sessions={sessions}
            stats={station.stats}
            truncated={sessionTotal > sessions.length}
          />

          <AutoDjRotation slug={station.slug} tracks={tracks} unavailable={tracksUnavailable} />

          <RecentBroadcasts sessions={sessions} />
        </div>

        <aside className="flex flex-col gap-6 min-w-0">
          {/* Above the share card on purpose: the audience is the reason the
              link exists, and seeing an empty room is what sends anyone to
              the share card underneath it. */}
          <LiveListeners
            slug={station.slug}
            isOnAir={station.state !== "offline"}
            peakListeners={station.stats?.peak_listeners ?? 0}
          />

          <StationShare url={playerUrl} stationName={station.name} slug={station.slug} />

          <StationChecklist
            station={station}
            trackCount={tracks.length}
            peakListeners={station.stats?.peak_listeners ?? 0}
          />
        </aside>
      </div>
    </div>
  )
}
