"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  IconLoader2,
  IconPlayerPlayFilled,
  IconPlayerStopFilled,
  IconPlayerTrackNextFilled,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import api from "@/lib/axios"
import { Station } from "@/interfaces/Station"
import { useStationStatus } from "@/hooks/useStationStatus"

interface StationPowerProps {
  station: Station
  /** Compact renders the badge + button only, for headers. */
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

function formatClock(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds)) return null
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, "0")}`
}

/**
 * The station power switch, plus everything its container is willing to tell
 * us about what's on air.
 *
 * Creating a station doesn't start it: a station holds a Liquidsoap container
 * only between start and stop, which is why an off-air station has no mount,
 * no listeners, and no now-playing. Everything below the button comes from
 * that container directly, so it stops rather than goes stale when the
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

  const badge = (
    <Badge
      variant="secondary"
      className={`gap-1 shrink-0 ${state === "live" ? "text-emerald-400" : ""}`}
    >
      <span
        className={`size-1.5 rounded-full ${
          state === "live"
            ? "bg-emerald-400"
            : state === "on_air"
              ? "bg-muted-foreground"
              : state === "starting"
                ? "bg-amber-400 animate-pulse"
                : state === "degraded"
                  ? "bg-red-400 animate-pulse"
                  : "bg-muted-foreground/40"
        }`}
      />
      {STATE_LABEL[state] ?? state}
    </Badge>
  )

  const powerButton = isRunning ? (
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
  ) : (
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
        {powerButton}
      </div>
    )
  }

  const nowPlaying = status?.now_playing
  const elapsed = formatClock(status?.elapsed ?? null)
  const remaining = formatClock(status?.remaining ?? null)

  return (
    <div className="border rounded-xl p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {badge}
          {status?.source === "autodj" && (
            <span className="text-xs text-muted-foreground">AutoDJ</span>
          )}
          {state === "starting" && (
            <span className="text-xs text-muted-foreground">
              building the audio chain, usually a few seconds
            </span>
          )}
        </div>
        <div className="shrink-0">{powerButton}</div>
      </div>

      {isRunning && (
        <div className="flex flex-col gap-3 border-t pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground mb-0.5">Now playing</div>
              {loading && !status ? (
                <div className="text-sm text-muted-foreground">Checking…</div>
              ) : nowPlaying ? (
                <div className="text-sm truncate">
                  {nowPlaying.title}
                  {nowPlaying.artist && (
                    <span className="text-muted-foreground"> — {nowPlaying.artist}</span>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {status?.reachable
                    ? "Silence — add tracks or go live"
                    : "Waiting for the station to answer"}
                </div>
              )}
              {(elapsed || remaining) && (
                <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                  {elapsed && <span>{elapsed} elapsed</span>}
                  {elapsed && remaining && <span> · </span>}
                  {remaining && <span>{remaining} left</span>}
                </div>
              )}
            </div>

            {status?.source === "autodj" && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => act("skip", "Skipped")}
                disabled={pending !== null}
                className="shrink-0"
              >
                {pending === "skip" ? (
                  <IconLoader2 size={14} className="animate-spin" data-icon="inline-start" />
                ) : (
                  <IconPlayerTrackNextFilled size={14} data-icon="inline-start" />
                )}
                Skip
              </Button>
            )}
          </div>

          {status && status.up_next.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">Up next</div>
              <ol className="text-sm flex flex-col gap-0.5">
                {status.up_next.slice(0, 3).map((track, index) => (
                  <li
                    key={track.id ?? `${track.title}-${index}`}
                    className="truncate text-muted-foreground"
                  >
                    {track.title}
                    {track.artist && <span> — {track.artist}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
