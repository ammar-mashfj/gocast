"use client"

import { cn } from "@/lib/utils"
import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  IconLoader2,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipForwardFilled,
} from "@tabler/icons-react"
import { airState, AIR_ACTION_LABEL, type AirAction, type AirTone } from "@/lib/airState"
import { formatClock } from "@/lib/format"
import { useEngineVersion } from "@/lib/useEngine"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useCurrentStation } from "@/contexts/StationContext"
import { useStationStatus } from "@/hooks/useStationStatus"
import { useStationPower } from "@/hooks/useStationPower"
import { useListenerCount } from "@/hooks/useListenerCount"
import { useBroadcastStats } from "@/hooks/useBroadcastStats"
import { useStudioSignal, useTransportHealth } from "@/components/studio/signal"
import { StatusBand } from "@/components/ds/StatusBand"
import { Button, type ButtonProps } from "@/components/ds/Button"

/**
 * The status band for the account's station, on every dashboard page.
 *
 * Replaces the red "back to studio" banner and the floating mini controller:
 * while a show runs from this tab, the band carries its uptime, its
 * listeners and a small transport (play / pause, skip), so the show can be
 * steered from any page. What it says comes from `airState` (lib/airState.ts).
 */
export function StationBand() {
  const station = useCurrentStation()
  if (!station) return null
  return <Band slug={station.slug} />
}

function Band({ slug }: { slug: string }) {
  const pathname = usePathname()
  const { state: broadcastState, stationSlug, engine, liveSince, micDisabled } = useBroadcast()
  useEngineVersion(engine)
  const { status, loading, showEnding } = useStationStatus(slug)
  const autoDjLocked = useAutoDjLocked()

  const broadcasting = (broadcastState === "live" || broadcastState === "reconnecting") && stationSlug === slug
  const onStudio = pathname?.startsWith(`/dashboard/stations/${slug}/studio`) ?? false
  // "Go live" links to the go-live page; on that page it would only reload it.
  const onGoLive = pathname?.startsWith(`/dashboard/stations/${slug}/live`) ?? false
  const transport = useTransportHealth(broadcasting)
  const signal = useStudioSignal(broadcasting ? transport : null, { inStudio: onStudio })

  const air = airState({
    status,
    statusLoading: loading,
    // This tab's state whenever it's about this station, not only once live:
    // airState reads `connecting`/`ready` to say "going live" while the
    // checks run, rather than calling the silence they leave a fault.
    broadcastState: stationSlug === slug ? broadcastState : "idle",
    signal,
    micLatched: !micDisabled && (engine?.isMicLatched() ?? false),
    autoDjLocked,
    onStudio,
    showEnding,
  })

  // Off the studio page the show's stats keep ticking here, so a peak
  // reached while the host was in the library still belongs to the show.
  // The studio counts them itself.
  const showStats = useBroadcastStats(stationSlug, broadcasting && !onStudio)
  // On the studio the band still shows the count — a phone's studio has no
  // stats strip — from the plain station count rather than a second copy of
  // the studio's show stats.
  const stationListeners = useListenerCount(slug, air.onAir && (!broadcasting || onStudio))
  const listeners = broadcasting && !onStudio ? showStats.listeners : stationListeners
  const now = useNow(broadcasting && liveSince !== null)

  const power = useStationPower(slug)

  const hasQueue = (engine?.getQueue().length ?? 0) > 0
  const playing = engine?.isPlaying() ?? false
  const onSolid = air.tone === "mic" || air.tone === "warn"
  // What the transport is steering, off the studio page: without it the
  // skip button is a leap in the dark. The studio shows its own deck.
  const track = broadcasting && !onStudio ? engine?.getCurrentTrack() ?? null : null

  return (
    <StatusBand
      tone={air.tone}
      label={air.label}
      message={air.message}
      shortMessage={air.short}
      meta={
        <>
          {track && (
            <span className="max-w-48 truncate font-sans text-sm font-medium tracking-normal" title={track.title}>
              {track.title}
            </span>
          )}
          {/* Not on the studio page: its stats strip shows the same clock
              right below, with when the show started. */}
          {broadcasting && liveSince !== null && !onStudio && (
            <span className="text-meter-sm tracking-normal">{formatClock((now - liveSince) / 1000)}</span>
          )}
          {/* On the studio, phones only: from md the stats strip has it. */}
          {air.onAir && listeners !== null && <span className={cn(onStudio && "md:hidden")}>{listeners} LISTENING</span>}
        </>
      }
    >
      {broadcasting && !onStudio && engine && (
        <>
          <Button
            size="icon-sm"
            variant={onSolid ? "ink" : "subtle"}
            onClick={() => engine.togglePlay()}
            disabled={!hasQueue}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
          </Button>
          <Button
            size="icon-sm"
            variant={onSolid ? "ink" : "subtle"}
            onClick={() => engine.next()}
            disabled={!hasQueue}
            aria-label="Next track"
          >
            <IconPlayerSkipForwardFilled />
          </Button>
        </>
      )}
      {air.action && !(air.action === "go-live" && onGoLive) && (
        <BandAction
          action={air.action}
          tone={air.tone}
          slug={slug}
          busy={power.pending === "start"}
          onStartAutoDj={power.start}
          onCloseMic={() => engine?.setMicLatched(false)}
        />
      )}
    </StatusBand>
  )
}

/** Which button style each band action wears, by the band it sits on. */
function actionVariant(action: AirAction, tone: AirTone): ButtonProps["variant"] {
  if (tone === "mic" || tone === "warn") return "ink"
  if (action === "start-autodj") return "onair-soft"
  if (tone === "live") return "live"
  return "primary"
}

function BandAction({
  action,
  tone,
  slug,
  busy,
  onStartAutoDj,
  onCloseMic,
}: {
  action: AirAction
  tone: AirTone
  slug: string
  busy: boolean
  onStartAutoDj: () => void
  onCloseMic: () => void
}) {
  const label = AIR_ACTION_LABEL[action]
  const props = { size: "sm" as const, variant: actionVariant(action, tone) }

  switch (action) {
    case "start-autodj":
      return (
        <Button {...props} onClick={onStartAutoDj} disabled={busy}>
          {busy && <IconLoader2 className="animate-spin" />}
          {label}
        </Button>
      )
    case "close-mic":
      return <Button {...props} onClick={onCloseMic}>{label}</Button>
    case "go-live":
      return (
        <Button {...props} dot={tone === "off" ? "live" : undefined} asChild>
          <Link href={`/dashboard/stations/${slug}/live`}>{label}</Link>
        </Button>
      )
    case "open-studio":
      return (
        <Button {...props} asChild>
          <Link href={`/dashboard/stations/${slug}/studio`}>{label}</Link>
        </Button>
      )
    case "add-tracks":
      return (
        <Button {...props} asChild>
          <Link href={`/dashboard/stations/${slug}/library`}>{label}</Link>
        </Button>
      )
  }
}

/** Wall-clock time, ticking once a second while `enabled`. */
function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [enabled])
  return now
}
