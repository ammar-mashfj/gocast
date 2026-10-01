"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { IconLoader2 } from "@tabler/icons-react"
import type { Station } from "@/interfaces/Station"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useStationStatus } from "@/hooks/useStationStatus"
import { useStationPower } from "@/hooks/useStationPower"
import { useListenerCount } from "@/hooks/useListenerCount"
import { useCountUp } from "@/hooks/useCountUp"
import { stationHero, type Hero, type HeroAction, type HeroTone } from "@/lib/stationHero"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ds/Button"
import { ConfirmDialog } from "@/components/ds/ConfirmDialog"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { HelpLink } from "@/components/dashboard/HelpLink"
import { NowPlayingWell } from "./NowPlayingWell"

/**
 * The overview's hero, as the prototype draws it: two panels on one rounded
 * surface whose fill is the station's state — plain off air, violet while
 * AutoDJ plays, solid red while someone is live, amber when listeners hear
 * nothing. Left: the state, what it means, what's playing, and the controls
 * that change it. Right: how many are listening.
 *
 * What it says comes from `stationHero` (lib/stationHero.ts); this component
 * only gathers the inputs and draws the answer.
 */
const SURFACE: Record<HeroTone, { panel: string; seam: string }> = {
  off: { panel: "bg-card", seam: "bg-background" },
  onair: { panel: "bg-on-air-tint", seam: "bg-background" },
  live: { panel: "surface-live", seam: "bg-live-deep" },
  caution: { panel: "bg-fault-tint", seam: "bg-background" },
}

const LAMP = { off: "off", onair: "onair", live: "live", caution: "warn" } as const

export function OverviewHero({ station }: { station: Station }) {
  const { status, loading } = useStationStatus(station.slug)
  const autoDjLocked = useAutoDjLocked()
  const { state: broadcastState, stationSlug } = useBroadcast()
  const liveFromThisBrowser = stationSlug === station.slug && (broadcastState === "live" || broadcastState === "reconnecting")
  const slow = useSlowStatus(loading && !status)
  const lastNowPlaying = useLastNowPlaying(status, station.state)

  const hero = stationHero({
    stationState: station.state,
    status,
    loading,
    slow,
    liveFromThisBrowser,
    autoDjLocked,
    lastNowPlaying,
    playlistName: station.programme?.playlist?.name ?? null,
  })

  const power = useStationPower(station.slug)
  const [confirmStop, setConfirmStop] = useState(false)
  const surface = SURFACE[hero.tone]

  return (
    <section aria-label="On air now" className={cn("flex flex-wrap gap-0.5 overflow-hidden rounded-hero", surface.seam)}>
      <div className={cn("flex min-w-0 flex-[2_1_26rem] flex-col gap-4.5 p-6 sm:p-7", surface.panel)}>
        <div className="flex flex-wrap items-center gap-2">
          <StatusLamp tone={LAMP[hero.tone]} variant={hero.tone === "live" ? "bare" : "soft"} pulse={hero.tone === "live"}>
            {hero.label}
          </StatusLamp>
          {hero.source && hero.tone !== "live" && <span className="text-caption text-muted-foreground">· {hero.source}</span>}
          <HelpLink article="turning-your-station-on-and-off" label="what each station status means" />
          {/* Announced once per change of state; `alert` only for the real fault. */}
          <p key={hero.headline} role={hero.headline === "fault" ? "alert" : "status"} className="sr-only">
            {`Station status: ${hero.label.toLowerCase()}. ${hero.title}`}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="font-display text-display text-balance">{hero.title}</h2>
          {hero.text && <p className="max-w-140 text-body text-pretty text-muted-foreground">{hero.text}</p>}
        </div>

        {hero.nowPlaying && <NowPlayingWell nowPlaying={hero.nowPlaying} status={status} />}

        {hero.actions.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-2.5">
            {hero.actions.map((a) => (
              <HeroButton
                key={a}
                action={a}
                hero={hero}
                slug={station.slug}
                pending={power.pending}
                onStart={power.start}
                onStop={() => (hero.stop.confirm ? setConfirmStop(true) : power.stop())}
              />
            ))}
          </div>
        )}
      </div>

      <ListeningNow slug={station.slug} hero={hero} autoDjLocked={autoDjLocked} className={surface.panel} />

      <ConfirmDialog
        open={confirmStop}
        onOpenChange={setConfirmStop}
        onConfirm={async () => {
          await power.stop()
          setConfirmStop(false)
        }}
        busy={power.pending !== null}
        title={`Stop AutoDJ on ${station.name}?`}
        description="Anyone listening is cut off and the station goes off air. Your music and playlists stay as they are, and you can start AutoDJ again any time."
        confirmLabel="Stop AutoDJ"
        keepLabel="Keep playing"
      />
      {/* Offered only after a stop is refused because DJ software is on
          air: cutting it off ends a real show, so it is never the first click. */}
      <ConfirmDialog
        open={power.cutoff !== null}
        onOpenChange={(open) => !open && power.dismissCutoff()}
        onConfirm={power.cutOff}
        busy={power.pending !== null}
        title="Cut off this broadcast?"
        description={
          <>
            {power.cutoff}{" "}
            Cutting it off takes {station.name} off air immediately and drops everyone listening. The encoder keeps
            trying to reconnect until it is stopped — if someone else has your stream key, choose{" "}
            <span className="font-medium text-foreground">New key</span> in settings afterwards.
          </>
        }
        confirmLabel="Cut it off"
        keepLabel="Leave it on air"
      />
    </section>
  )
}

function HeroButton({
  action,
  hero,
  slug,
  pending,
  onStart,
  onStop,
}: {
  action: HeroAction
  hero: Hero
  slug: string
  pending: "start" | "stop" | null
  onStart: () => void
  onStop: () => void
}) {
  const onRed = hero.tone === "live"
  switch (action) {
    case "go-live":
      return hero.goLiveDisabled ? (
        <Button size="lg" dot="live" disabled>Go live now</Button>
      ) : (
        <Button size="lg" dot="live" asChild>
          <Link href={`/dashboard/stations/${slug}/live`}>Go live now</Link>
        </Button>
      )
    case "open-studio":
      // A Link: a full page load would tear down the live socket.
      return (
        <Button size="lg" variant="ink" asChild>
          <Link href={`/dashboard/stations/${slug}/studio`}>Open the studio</Link>
        </Button>
      )
    case "hear-stream":
      return (
        <Button size="lg" variant={onRed ? "ink" : "primary"} asChild>
          <a href={`/station/${slug}`} target="_blank" rel="noopener noreferrer">Hear your stream ↗</a>
        </Button>
      )
    case "start-autodj":
      return (
        <Button size="lg" variant="onair" onClick={onStart} disabled={pending !== null}>
          {pending === "start" && <IconLoader2 className="animate-spin" />}
          Start AutoDJ
        </Button>
      )
    case "stop":
      return (
        <Button size="lg" variant="ghost" onClick={onStop} disabled={pending !== null || hero.stopDisabled}>
          {pending === "stop" && <IconLoader2 className="animate-spin" />}
          {hero.stop.label}
        </Button>
      )
  }
}

/** The hero's right panel: the listener count, big. */
function ListeningNow({ slug, hero, autoDjLocked, className }: { slug: string; hero: Hero; autoDjLocked: boolean; className: string }) {
  const onAir = hero.tone !== "off"
  const count = useListenerCount(slug, onAir)
  const shown = useCountUp(onAir ? count : null)
  const line =
    !onAir
      ? autoDjLocked
        ? "Go live to start counting."
        : "Start AutoDJ or go live to start counting."
      : count === null
        ? "Counting who’s tuned in…"
        : count === 0
          ? "Nobody yet. Share your link below."
          : hero.tone === "live"
            ? "Tuned in to your show right now."
            : "On your player page and the direct stream."

  return (
    <div className={cn("flex min-w-0 flex-[1_1_16rem] flex-col gap-2.5 p-6 sm:p-7", className)}>
      <span className="eyebrow text-muted-foreground">Listening now</span>
      <span className="font-mono text-meter-xl tabular-nums" aria-live="polite">
        {shown === null ? <span className="text-text-faint">—</span> : shown}
      </span>
      <span className="text-sm text-pretty text-muted-foreground">{line}</span>
      <Link href={`/dashboard/stations/${slug}/audience`} className="mt-auto pt-2 text-body-sm font-semibold hover:underline">
        See your audience →
      </Link>
    </div>
  )
}

/** True once the first status read has been outstanding for ten seconds. */
function useSlowStatus(waiting: boolean): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!waiting) return
    const t = setTimeout(() => setSlow(true), 10_000)
    return () => {
      clearTimeout(t)
      setSlow(false)
    }
  }, [waiting])
  return slow
}

/**
 * The last title the container reported, held across the moment between
 * tracks when it reports none — polled every few seconds, that gap is hit
 * often enough that the title would flicker. Cleared when the station goes
 * off air and when a broadcaster arrives or leaves, so a title never
 * outlives its source.
 */
function useLastNowPlaying(
  status: ReturnType<typeof useStationStatus>["status"],
  stationState: Station["state"],
) {
  type Title = { title: string | null; artist: string | null }
  const np = status?.now_playing ?? null
  const running = (status?.state ?? stationState) !== "offline"
  // Across a handover the title belongs to the side that is leaving.
  const handover = status?.reachable === true && (status.broadcaster === true) !== (status.source === "live")
  const broadcaster = status?.broadcaster ?? null

  const [held, setHeld] = useState<Title | null>(null)
  const [seen, setSeen] = useState({ np, running, broadcaster })
  // Adjusted while rendering (React's pattern for state derived from a
  // changing prop), so the held title is right on the same render.
  if (seen.np !== np || seen.running !== running || seen.broadcaster !== broadcaster) {
    setSeen({ np, running, broadcaster })
    if (!running || seen.broadcaster !== broadcaster) setHeld(null)
    else if (np && !handover) setHeld(np)
  }
  return held
}
