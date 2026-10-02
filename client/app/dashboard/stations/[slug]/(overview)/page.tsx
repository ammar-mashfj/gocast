import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { IconExternalLink, IconSettings } from "@tabler/icons-react"
import { apiFetch, ApiFetchError, redirectIfSessionExpired } from "@/lib/api-server"
import { env } from "@/lib/env"
import { Station } from "@/interfaces/Station"
import { StreamSession } from "@/interfaces/StreamSession"
import type { Playlist } from "@/interfaces/Playlist"
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
import { StationActions } from "../StationActions"
import { ShowSignOff } from "@/components/dashboard/ShowSignOff"

/**
 * Every station encodes identically — it is hardcoded in the Liquidsoap
 * template (`%mp3(bitrate=128, samplerate=44100)`), not a per-station setting,
 * so there is nothing to read off the API. Stated here because "what quality
 * do my listeners get?" is a question the page should answer without anyone
 * having to ask support.
 */
const STREAM_FORMAT = "Streams in MP3, 128 kbps"

// Its own tab title: every dashboard tab used to read the marketing title,
// so history and open tabs were indistinguishable.
export const metadata: Metadata = { title: "Overview" }

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
  let playlist: Playlist | null
  let defaultName: string | null
  let tracksUnavailable: boolean

  // All three in one flight. The rotation used to be fetched AFTER this block
  // resolved, purely because its failure is handled differently — which put a
  // third round-trip in series in front of a page that already waits on two.
  // The different handling belongs in the catch, not in the ordering: a
  // failing track fetch degrades one card rather than taking the route down,
  // so it settles to an empty rotation instead of rejecting, and the
  // Promise.all only ever sees the two failures that are actually fatal.
  try {
    const [stationRes, sessionsRes, playlistsRes] = await Promise.all([
      apiFetch<{ data: Station }>(`/stations/${slug}`),
      // Laravel's paginator, so `total` is what tells us whether the 14-day
      // window below is complete or merely the first page of a busy station.
      apiFetch<{ data: StreamSession[]; total?: number }>(`/stations/${slug}/sessions`),
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

    // What AutoDJ actually plays is whichever playlist the programme
    // resolves to right now (a slot's, or the default) — not the library: a
    // track in no playlist never airs. One more hop for its members, and a
    // failure here degrades one card rather than taking the route down.
    const activeId = station.programme?.playlist?.id ?? playlistsRes?.find((p) => p.is_default)?.id ?? null
    playlist = playlistsRes?.find((p) => p.id === activeId) ?? null
    defaultName = playlistsRes?.find((p) => p.is_default)?.name ?? null
    if (playlistsRes === null) {
      tracks = []
      tracksUnavailable = true
    } else if (activeId === null) {
      tracks = []
      tracksUnavailable = false
    } else {
      try {
        tracks = (await apiFetch<{ data: Track[] }>(`/playlists/${activeId}/tracks`)).data
        tracksUnavailable = false
      } catch (err) {
        console.error(`[station/${slug}] rotation fetch failed:`, err)
        tracks = []
        tracksUnavailable = true
      }
    }
  } catch (err) {
    // Only render the 404 page when the backend actually said the station
    // is missing — or that it isn't yours (403 from StationPolicy::view),
    // which is the same answer from where this user stands and shouldn't
    // confirm that someone else's slug exists. A 401 is a stale cookie and
    // goes to the login page. Any other failure (timeout, 5xx)
    // is a real error and must not be silently masked as "not found" — log
    // it and rethrow so Next.js surfaces it via the error boundary.
    redirectIfSessionExpired(err)
    if (err instanceof ApiFetchError && (err.status === 404 || err.status === 403)) {
      notFound()
    }
    console.error(`[station/${slug}] fetch failed:`, err)
    throw err
  }

  const playerUrl = `${env.appUrl}/station/${station.slug}`
  const lastEnded = sessions.find((s) => s.ended_at)?.ended_at ?? null

  // Header meta line. Each part is dropped rather than shown empty, so a brand
  // new station gets a short honest line instead of a row of dashes.
  //
  // Identity only. It used to carry a broadcast count and "Live now", and both
  // contradicted the page below them: the count included the show in
  // progress while Broadcast activity counts finished shows (89 over 88), and
  // "Live now" came from the owner's intent while the control strip polls the
  // container — so the header could say Live over a strip saying "Status
  // unknown". The strip owns the state and Broadcast activity owns the count.
  const meta = [
    `Created ${formatDate(station.created_at)}`,
    STREAM_FORMAT,
    station.state === "offline" && lastEnded
      ? `Last live ${formatDate(lastEnded, "relative")}`
      : null,
  ].filter(Boolean) as string[]

  return (
    <div className="sheet flex flex-col gap-8">
      <ShowSignOff slug={station.slug} />

      {/* Header — identity and low-risk actions only. Anything that changes
          what listeners hear lives in the status panel below, so there is one
          place to look rather than two buttons that both mean "begin". */}
      {/* One grid, two arrangements. On a phone the artwork sits beside the
          name (stacked, a 64px square sat alone on its row with the width
          empty beside it), the description and facts run the full width
          beneath, and the actions take a row of their own. From lg (md still has the sidebar open, and the actions ran
          past a 768px screen) the artwork spans both text rows on the left and the actions stand at
          the right. */}
      <header className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:grid-rows-[auto_auto] lg:gap-x-5">
        <StationArtwork
          src={station.artwork_url}
          alt={station.name}
          className="size-16 lg:size-24 rounded-2xl shrink-0 lg:row-span-2"
          iconSize={24}
          sizes="96px"
          priority
        />
        <div className="flex items-center gap-2 min-w-0 self-center lg:self-auto">
          <h1 className="font-display text-2xl font-semibold truncate">{station.name}</h1>
          {station.genre && (
            <Badge variant="secondary" className="shrink-0 text-[11px]" title="genre">{station.genre}</Badge>
          )}
        </div>
        <div className="col-span-2 min-w-0 flex flex-col gap-2 lg:col-span-1 lg:col-start-2">
          {station.description && (
            <p className="max-w-[70ch] text-sm text-muted-foreground line-clamp-2">
              {station.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            {meta.map((part, i) => (
              <span key={part} className="inline-flex items-center gap-2">
                {i > 0 && <span className="text-muted-foreground/60" aria-hidden="true">·</span>}
                {part}
              </span>
            ))}
          </div>
        </div>

        <div className="col-span-2 mt-2 flex items-center gap-2 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:mt-0">
          <Button variant="outline" className="flex-1 lg:flex-initial" asChild>
            <a href={`/station/${station.slug}`} target="_blank" rel="noopener noreferrer">
              <IconExternalLink data-icon="inline-start" />
              Player page
            </a>
          </Button>
          <StationActions station={station} mode="edit" className="flex-1 lg:flex-initial" />
          <Button variant="outline" size="icon" asChild title="Station settings">
            <Link href={`/dashboard/stations/${station.slug}/settings`}>
              <IconSettings />
              <span className="sr-only">Station settings</span>
            </Link>
          </Button>
        </div>
      </header>

      {/* The control room: one continuous sheet in two groups — what is on
          air now (with how to get it heard), and how the shows went — divided by hairline
          rules like the homepage, not stacked under kicker labels. */}
      <section aria-label="On air now" className="flex flex-col gap-6">
        {/* One poll, one strip: can anyone hear this station, what are they
            hearing, and how many of them are there. */}
        <StationPower
          station={station}
          aside={
            <LiveListeners
              slug={station.slug}
              isOnAir={station.state !== "offline"}
              peakListeners={station.stats?.peak_listeners ?? 0}
              bare
            />
          }
        />
        {/* Straight under the power bar: it is the action that fills the
            listener count up there, and that panel points here. The
            checklist (new stations only) follows it. */}
        <StationShare url={playerUrl} appUrl={env.appUrl} stationName={station.name} slug={station.slug} />
        <StationChecklist
          station={station}
          trackCount={tracks.length}
          hasListeners={
            station.stats?.has_listeners ?? (station.stats?.peak_listeners ?? 0) > 0
          }
        />
        <div className="border-t border-white/[0.07] pt-6">
        <AutoDjRotation
          slug={station.slug}
          tracks={tracks}
          playlistName={playlist?.name ?? null}
          programme={station.programme ?? null}
          timezone={station.timezone}
          defaultName={defaultName}
          unavailable={tracksUnavailable}
        />
        </div>
      </section>

      <section
        aria-label="Your shows"
        // Two columns split by a vertical rule instead of two boxes.
        className="grid grid-cols-[minmax(0,1fr)] items-start gap-8 border-t border-white/[0.07] pt-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,30rem)] xl:gap-0 xl:divide-x xl:divide-white/[0.07] xl:[&>*:first-child]:pr-8 xl:[&>*+*]:pl-8"
      >
        <StationActivity
          sessions={sessions}
          stats={station.stats}
          truncated={sessionTotal > sessions.length}
        />
        <RecentBroadcasts sessions={sessions} />
      </section>

    </div>
  )
}
