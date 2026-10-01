"use client"

import { useState } from "react"
import type { Station } from "@/interfaces/Station"
import type { StationStatus } from "@/interfaces/StationStatus"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useStationPower } from "@/hooks/useStationPower"
import { stationHero, type Headline } from "@/lib/stationHero"
import { cn } from "@/lib/utils"
import { ConfirmDialog } from "@/components/ds/ConfirmDialog"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { Switch } from "@/components/ds/Switch"
import { TimeLeft } from "@/components/dashboard/overview/NowPlayingWell"

/** Running, from AutoDJ's point of view: the switch shows on. */
const ON: Headline[] = ["on_air", "silent", "starting", "fault"]

/**
 * AutoDJ on or off, at the top of its own page (the prototype's strip): what
 * it's playing, how long is left, what's next, and a violet switch. Off asks
 * first when listeners would be cut off; the switch is disabled while you're
 * live (AutoDJ takes back when you end). Same rules and actions as the
 * overview hero (lib/stationHero, hooks/useStationPower).
 */
export function AutoDjStrip({ station, status, loading }: { station: Station; status: StationStatus | null; loading: boolean }) {
  const { state, stationSlug } = useBroadcast()
  const power = useStationPower(station.slug)
  const [confirming, setConfirming] = useState(false)
  const hero = stationHero({
    stationState: station.state,
    status,
    loading,
    slow: false,
    liveFromThisBrowser: stationSlug === station.slug && (state === "live" || state === "reconnecting"),
    autoDjLocked: false,
    lastNowPlaying: null,
    playlistName: station.programme?.playlist?.name ?? null,
  })

  const on = ON.includes(hero.headline)
  const unknown = hero.headline === "checking" || hero.headline === "no_answer"
  const live = hero.headline === "live"
  const track = hero.nowPlaying?.track

  const { tone, label, text } =
    live
      ? { tone: "live" as const, label: "LIVE", text: "You’re live. AutoDJ takes back the station when you end." }
      : hero.headline === "on_air"
        ? {
            tone: "onair" as const,
            label: "ON AIR · AUTODJ",
            text: track ? (
              <>
                Playing {track.title}
                {hero.nowPlaying?.progress && (
                  <>
                    {" · "}
                    <TimeLeft status={status} signed={false} /> left
                  </>
                )}
                .{hero.nowPlaying?.next ? ` Next: ${hero.nowPlaying.next}.` : ""}
              </>
            ) : (
              hero.nowPlaying?.line ?? "AutoDJ is playing."
            ),
          }
        : hero.headline === "silent"
          ? { tone: "warn" as const, label: "SILENCE", text: "AutoDJ is on but has nothing to play. Add tracks to its playlist." }
          : hero.headline === "starting"
            ? { tone: "off" as const, label: "STARTING", text: "AutoDJ is starting up." }
            : hero.headline === "fault"
              ? { tone: "warn" as const, label: "NOT HEARD", text: "AutoDJ is running, but listeners can’t hear it right now." }
              : unknown
                ? { tone: "off" as const, label: "CHECKING", text: "Checking what’s on air…" }
                : { tone: "off" as const, label: "OFF", text: "AutoDJ is off. Switch it on to play your music whenever you’re not live." }

  function toggle(next: boolean) {
    if (next) void power.start()
    else if (hero.stop.confirm) setConfirming(true)
    else void power.stop()
  }

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-4 rounded-panel px-4.5 py-4",
        tone === "onair" ? "bg-on-air-tint" : tone === "warn" ? "bg-fault-tint" : "bg-card",
      )}
    >
      <StatusLamp tone={tone} variant="soft">{label}</StatusLamp>
      <p className="min-w-55 flex-1 text-sm text-pretty text-muted-foreground">{text}</p>
      <Switch
        tone="onair"
        checked={on && !live}
        onCheckedChange={toggle}
        disabled={live || unknown || power.pending !== null}
        aria-label={on ? "Turn AutoDJ off" : "Turn AutoDJ on"}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={async () => {
          await power.stop()
          setConfirming(false)
        }}
        busy={power.pending !== null}
        title={`Stop AutoDJ on ${station.name}?`}
        description="Anyone listening is cut off and the station goes off air. Your music and playlists stay as they are."
        confirmLabel="Stop AutoDJ"
        keepLabel="Keep playing"
      />
    </div>
  )
}
