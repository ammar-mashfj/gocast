"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  IconBroadcast,
  IconLoader2,
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
  IconPlayerTrackNextFilled,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import api from "@/lib/axios"
import { cn } from "@/lib/utils"
import { Station } from "@/interfaces/Station"
import { useStationStatus } from "@/hooks/useStationStatus"
import { useListenerCount } from "@/hooks/useListenerCount"
import { GoLiveTrigger } from "@/components/dashboard/GoLiveTrigger"

interface StationPowerProps {
  station: Station
  /** Compact renders the badge + power button only, for headers. */
  compact?: boolean
}

const STATE_LABEL: Record<string, string> = {
  offline: "Off air",
  starting: "Starting…",
  on_air: "On air",
  live: "Live",
  // The station is running and producing audio, but Icecast isn't carrying it
  // — so nobody can hear it. Named for what the listener experiences rather
  // than for the component that failed.
  degraded: "Not reaching listeners",
}

/**
 * The one place on the station page that owns airtime.
 *
 * It used to be a power switch sitting next to a separate "Go live" button in
 * the header, which left two adjacent controls both meaning "begin" — and the
 * second silently depending on the first. Everything that changes what
 * listeners hear now lives here: putting the station on air, taking it over
 * live, skipping a track, going off air.
 *
 * Creating a station doesn't start it: a station holds a Liquidsoap container
 * only between start and stop, which is why an off-air station has no mount,
 * no listeners, and no now-playing. Everything below the status line comes
 * from that container directly, so it stops rather than goes stale when the
 * station goes off air.
 */
export function StationPower({ station, compact = false }: StationPowerProps) {
  const router = useRouter()
  const { status, loading, refresh } = useStationStatus(station.slug)
  const [pending, setPending] = useState<"start" | "stop" | "skip" | null>(null)

  // Fall back to the coarse state from the station payload until the first
  // poll lands, so the badge doesn't flicker through "unknown" on mount.
  const state = status?.state ?? station.state
  const isRunning = state !== "offline"
  const isLive = state === "live"
  const isAutoDj = status?.source === "autodj"

  // Only worth asking while there is a mount for anyone to be connected to.
  const listeners = useListenerCount(station.slug, isRunning)

  async function act(
    action: "start" | "stop" | "skip",
    successMessage: string,
  ) {
    if (pending) return
    setPending(action)
    try {
      await api.post(`/stations/${station.slug}/${action}`)
      toast.success(successMessage)
      await refresh()
      // The server-rendered page carries desired_state and the badges built
      // from it — refresh so a reload isn't needed to see the new state.
      router.refresh()
    } catch (err) {
      const response = (err as {
        response?: { status?: number; data?: { message?: string } }
      })?.response
      // The API writes these for humans (plan limits, "end your broadcast
      // first"), so show them rather than a generic failure.
      toast.error(response?.data?.message ?? "Something went wrong — please try again")
    } finally {
      setPending(null)
    }
  }

  const dotClass =
    state === "live"
      ? "bg-emerald-400"
      : state === "on_air"
        ? "bg-primary"
        : state === "starting"
          ? "bg-amber-400 animate-pulse"
          : state === "degraded"
            ? "bg-destructive animate-pulse"
            : "bg-muted-foreground/40"

  const badge = (
    <Badge
      variant="secondary"
      className={cn("gap-1 shrink-0", state === "live" && "text-emerald-400")}
    >
      <span className={cn("size-1.5 rounded-full", dotClass)} />
      <span className="text-xs">{STATE_LABEL[state] ?? state}</span>
    </Badge>
  )

  const stopButton = (
    <Button
      variant="outline"
      onClick={() => act("stop", "Station is off air")}
      disabled={pending !== null}
      className="w-full md:w-auto"
    >
      {pending === "stop" ? (
        <IconLoader2 size={14} className="animate-spin" data-icon="inline-start" />
      ) : (
        <IconPlayerStopFilled size={14} data-icon="inline-start" />
      )}
      Take off air
    </Button>
  )

  const startButton = (
    <Button
      onClick={() => act("start", "Station is coming on air")}
      disabled={pending !== null}
      className="w-full md:w-auto"
    >
      {pending === "start" ? (
        <IconLoader2 size={14} className="animate-spin" data-icon="inline-start" />
      ) : (
        <IconPlayerPlayFilled size={14} data-icon="inline-start" />
      )}
      Put on air
    </Button>
  )

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {badge}
        {isRunning ? stopButton : startButton}
      </div>
    )
  }

  // Headline — the same question the page opens with, answered in the
  // station's own terms rather than in ours. "On air" alone never said who
  // was making the sound.
  const headline =
    state === "live"
      ? "Live on air"
      : state === "starting"
        ? "Coming on air"
        : state === "degraded"
          ? "Not reaching listeners"
          : state === "on_air"
            ? isAutoDj
              ? "AutoDJ on air"
              : "On air"
            : "Off air"

  const headlineClass =
    state === "live"
      ? "text-emerald-400"
      : state === "degraded"
        ? "text-destructive"
        : state === "on_air"
          ? "text-primary"
          : "text-muted-foreground"

  const nowPlaying = status?.now_playing
  const upNext = status?.up_next?.[0]

  /** The big line: what a listener pressing play would hear this second. */
  let headlineDetail: string
  if (!isRunning) {
    headlineDetail = "Nobody can tune in right now"
  } else if (state === "starting") {
    headlineDetail = "Building the audio chain…"
  } else if (loading && !status) {
    headlineDetail = "Checking…"
  } else if (nowPlaying) {
    headlineDetail = [nowPlaying.title, nowPlaying.artist].filter(Boolean).join(" — ")
  } else if (status?.reachable) {
    headlineDetail = "Silence — add tracks or go live"
  } else {
    headlineDetail = "Waiting for the station to answer"
  }

  // Second line. Both halves are optional, so it collapses to whichever is
  // true rather than printing "Up next: —".
  const detailParts: string[] = []
  // Guarded on isRunning: the status endpoint still answers with the rotation
  // it *would* play, and an off-air station promising an "up next" is a lie —
  // there is no mount, so nothing is next until someone starts it.
  if (isRunning && upNext) {
    detailParts.push(`Up next: ${[upNext.title, upNext.artist].filter(Boolean).join(" — ")}`)
  }
  if (isRunning && listeners !== null) {
    detailParts.push(listeners === 1 ? "1 listener tuned in" : `${listeners} listeners tuned in`)
  }
  if (!isRunning) {
    detailParts.push("Put it on air and your AutoDJ rotation plays to anyone with the link")
  }

  return (
    <section
      className={cn(
        "rounded-xl border p-5 flex flex-col gap-5 md:flex-row md:items-center md:justify-between",
        isRunning
          ? "border-primary/25 bg-gradient-to-br from-primary/10 via-card/40 to-card/40"
          : "border-border bg-card/40",
      )}
    >
      <div className="min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className={cn("size-1.5 rounded-full shrink-0", dotClass)} />
          <span className={cn("text-xs font-medium uppercase tracking-wider", headlineClass)}>
            {headline}
          </span>
        </div>

        <div className="flex items-center gap-1 min-w-0">
          <span className="text-lg font-medium truncate">{headlineDetail}</span>
          {isAutoDj && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => act("skip", "Skipped")}
              disabled={pending !== null}
              className="shrink-0 text-muted-foreground"
              title="Skip to the next track"
            >
              {pending === "skip" ? (
                <IconLoader2 size={14} className="animate-spin" />
              ) : (
                <IconPlayerTrackNextFilled size={14} />
              )}
              <span className="sr-only">Skip track</span>
            </Button>
          )}
        </div>

        {detailParts.length > 0 && (
          <div className="text-sm text-muted-foreground truncate">
            {detailParts.join(" • ")}
          </div>
        )}
      </div>

      {/* Actions, most-wanted first. Off air, the thing you want is a mount;
          once there is one, the thing you want is the microphone. */}
      <div className="flex flex-col gap-2 shrink-0 md:min-w-[190px]">
        {isLive ? (
          <Button asChild className="w-full md:w-auto">
            <a href={`/dashboard/stations/${station.slug}/studio`}>
              <IconBroadcast size={14} data-icon="inline-start" />
              Open studio
            </a>
          </Button>
        ) : isRunning ? (
          <GoLiveTrigger slug={station.slug} name={station.name}>
            <Button className="w-full md:w-auto">
              <IconBroadcast size={14} data-icon="inline-start" />
              Take over live
            </Button>
          </GoLiveTrigger>
        ) : (
          startButton
        )}

        {isRunning ? (
          stopButton
        ) : (
          <GoLiveTrigger slug={station.slug} name={station.name}>
            <Button variant="outline" className="w-full md:w-auto">
              <IconBroadcast size={14} data-icon="inline-start" />
              Go live
            </Button>
          </GoLiveTrigger>
        )}
      </div>
    </section>
  )
}
