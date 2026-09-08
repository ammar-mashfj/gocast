"use client"

import { useEffect, useRef, useState } from "react"
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
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useStationStatus } from "@/hooks/useStationStatus"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { GoLiveTrigger } from "@/components/dashboard/GoLiveTrigger"

interface StationPowerProps {
  station: Station
  /** Compact renders the badge + power button only, for headers. */
  compact?: boolean
}

/**
 * The POWER axis, and only that: can a listener hear anything at all?
 *
 * `live` deliberately maps to "On air" rather than "Live". A live broadcast is
 * not a bigger version of being on air — it is being on air with a person as
 * the source. Listing the two as peer values here is what had owners reading
 * "Go live" and "Put on air" as two ways to start the same thing, when in fact
 * going live already starts the station (see ensureStationOnAir in
 * lib/broadcast.ts). What is making the sound is a separate axis, rendered
 * beside this one as SOURCE_LABEL below and never folded into it.
 */
const STATE_LABEL: Record<string, string> = {
  offline: "Off air",
  starting: "Starting…",
  on_air: "On air",
  live: "On air",
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
 *
 * RENDERS TWO CARDS, not one. The first answers "can anyone hear this
 * station?" and owns every control that changes the answer; the second answers
 * "what are they hearing?" and owns the source, the track and the skip. They
 * were a single card, which is what let the two questions blur into one — a
 * card headed "Live on air" reads as a station in a different mode rather than
 * a station with a person as its source.
 *
 * They are siblings from ONE component rather than two independently mounted
 * ones because both are views of a single `useStationStatus` poll. Splitting
 * them into separate components would put two timers on the same endpoint and
 * let the two cards disagree with each other mid-poll.
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

  // Is the broadcast coming from THIS tab? The broadcast context is per-tab,
  // so a positive answer is certain while a negative one is not: another tab
  // of this same browser, another machine, and an external encoder all look
  // identical from here. Hence "another source" rather than "another device" —
  // the only phrasing that is true in all three cases. Naming the actual
  // device would need harbor's `live_connected` callback to carry the source's
  // identity; today StationEventController opens every session with a
  // hardcoded source_type of 'browser'.
  const { state: broadcastState, stationSlug: broadcastSlug } = useBroadcast()
  const liveFromThisBrowser =
    broadcastSlug === station.slug &&
    (broadcastState === "live" || broadcastState === "reconnecting")

  /**
   * The SOURCE axis: what is actually making the sound.
   *
   * Null whenever we cannot answer honestly — off air, or the container has
   * not replied yet — so the UI omits the chip rather than guessing. "Live"
   * on its own said only that a human was publishing, never from where, which
   * is the one thing an owner staring at the badge wants to know.
   */
  const sourceLabel =
    !isRunning || !status?.reachable
      ? null
      : isLive
        ? liveFromThisBrowser
          ? "Live from this browser"
          : "Live from another source"
        : status.source === "autodj"
          ? "AutoDJ"
          : status.source === "silence"
            ? "Silence"
            : null

  // Without AutoDJ there is no unattended arm: the station's AutoDJ source is
  // a silence bed, so a station that is on air with nobody broadcasting emits
  // nothing and `stations:sweep` takes it back off within the silence window.
  // "Put on air" is therefore not a weaker version of "Go live" on this plan —
  // it is a minute-long no-op, and offering it is offering a dead end.
  //
  // False when the plan is unknown, by design (see useAutoDjLocked), so a
  // failed /user shows the full set of controls rather than hiding one from
  // somebody who paid for it.
  const autoDjLocked = useAutoDjLocked()

  // Last title the container reported, held across the gaps between tracks.
  //
  // `now_playing` is legitimately null for the moment between one track ending
  // and the next announcing itself: the container reports no metadata and the
  // Redis push is cleared. Polling every ten seconds lands in that window often
  // enough to matter, and on a rotation of very short tracks it lands there
  // most of the time. Without this the headline flickers between the track and
  // a fallback message, which reads as a station that keeps breaking.
  //
  // Cleared the moment the station goes off air, so a stopped station never
  // shows what it used to be playing.
  const lastNowPlaying = useRef<{ title: string | null; artist: string | null } | null>(null)

  useEffect(() => {
    if (!isRunning) {
      lastNowPlaying.current = null
    } else if (status?.now_playing) {
      lastNowPlaying.current = status.now_playing
    }
  }, [isRunning, status?.now_playing])

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
    <Badge variant="secondary" className="gap-1.5 shrink-0">
      <span className={cn("size-1.5 rounded-full", dotClass)} />
      <span className="text-xs">{STATE_LABEL[state] ?? state}</span>
      {sourceLabel && (
        <>
          <span className="text-xs text-muted-foreground/50" aria-hidden="true">·</span>
          <span
            className={cn("text-xs", isLive ? "text-emerald-400" : "text-muted-foreground")}
          >
            {sourceLabel}
          </span>
        </>
      )}
    </Badge>
  )

  // The card stacks on narrow widths and its buttons go full-width with it.
  // The compact variant is an inline toolbar with no such container, so it
  // keeps intrinsic widths — resolving `@xl/power:` with no `power` container
  // in scope would leave those buttons permanently full-width.
  const actionClass = compact ? "w-auto" : "w-full @lg/power:w-auto"

  const stopButton = (
    <Button
      variant="outline"
      onClick={() => act("stop", "Station is off air")}
      disabled={pending !== null}
      className={actionClass}
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
      className={actionClass}
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
        {isRunning ? (
          stopButton
        ) : autoDjLocked ? (
          <GoLiveTrigger slug={station.slug} name={station.name}>
            <Button className={actionClass}>
              <IconBroadcast size={14} data-icon="inline-start" />
              Go live
            </Button>
          </GoLiveTrigger>
        ) : (
          startButton
        )}
      </div>
    )
  }

  // Headline — the power axis only. It used to answer both questions in one
  // phrase ("Live on air" / "AutoDJ on air"), which made the source look like
  // a different KIND of on-air rather than an attribute of it. The source now
  // sits next to it, so the first thing read is always the same question:
  // can anyone hear this station?
  const headline =
    state === "starting"
      ? "Coming on air"
      : state === "degraded"
        ? "Not reaching listeners"
        : isRunning
          ? "On air"
          : "Off air"

  const headlineClass =
    state === "degraded"
      ? "text-destructive"
      : state === "starting" || !isRunning
        ? "text-muted-foreground"
        : "text-primary"

  /**
   * The power card's big line: what this state MEANS for a listener. It used
   * to be the track title, which is what made one card try to answer two
   * questions — the track now has a card of its own and this one never
   * mentions it.
   */
  const powerDetail = !isRunning
    ? "Nobody can tune in right now"
    : state === "starting"
      ? "Building the audio chain…"
      : state === "degraded"
        ? "The audio is fine — it just isn't reaching Icecast"
        : loading && !status
          ? "Checking…"
          : !status?.reachable
            ? "Waiting for the station to answer"
            : "Anyone with your link can tune in"

  /** Off air only: what the button underneath is actually going to do. */
  const powerHint = isRunning
    ? null
    : autoDjLocked
      ? "Go live and anyone with the link can tune in while you broadcast"
      : "Put it on air and your AutoDJ rotation plays to anyone with the link"

  const nowPlaying = status?.now_playing ?? lastNowPlaying.current
  const upNext = status?.up_next?.[0]
  const hasRotation = (status?.playlist_length ?? 0) > 0

  /** The now-playing card's big line: what is coming out of the mount. */
  let nowPlayingLine: string
  if (state === "starting") {
    nowPlayingLine = "Waiting for audio…"
  } else if (loading && !status) {
    nowPlayingLine = "Checking…"
  } else if (nowPlaying) {
    nowPlayingLine = [nowPlaying.title, nowPlaying.artist].filter(Boolean).join(" — ")
  } else if (!status?.reachable) {
    nowPlayingLine = "Waiting for the station to answer"
  } else if (isLive) {
    // A broadcaster only has a title if their software sends one. Saying
    // "waiting for track info" would imply something is late; nothing is.
    nowPlayingLine = "A live broadcast — no track info sent"
  } else if (hasRotation) {
    // Producing audio from a rotation that exists, but no title has been seen
    // yet. Telling this owner to "add tracks" would be advice to fix something
    // that is not broken — they have tracks, and the station is playing them.
    nowPlayingLine = "On air — waiting for track info"
  } else {
    nowPlayingLine = autoDjLocked
      ? "Silence — go live to put sound on air"
      : "Silence — add tracks or go live"
  }

  return (
    // Declares the container and NOTHING else. A container query styles the
    // DESCENDANTS of a container, never the container element itself, so
    // `@container/cards` and `@3xl/cards:` cannot sit on one div — the variant
    // would look past this element for an ancestor named `cards`, find none,
    // and silently never match.
    <div className="@container/cards">
      <div
        className={cn(
          // Queried rather than keyed to the viewport because this sits in a
          // grid column that is ~600px wide on a 1024px viewport and ~880px on
          // a 1280px one — a viewport breakpoint would put two cards side by
          // side in a space that only fits one. 48rem is where each card still
          // clears ~370px; below that they stack.
          //
          // Conditional on isRunning because the second card is absent off
          // air, and a lone card in a two-column grid would sit in the left
          // half with dead space beside it.
          "grid gap-6",
          isRunning && "@3xl/cards:grid-cols-2",
        )}
      >
        {/* -------------------------------------------------------------
            Card one: is this station on air? Power, and only power. */}
        <section
          className={cn(
            // Declares the container; the row/column switch lives on the child
            // below, for the reason given on the wrapper above. Both used to
            // be on this one element, which is why this card stayed stacked at
            // every width — `@xl/power:` never matched anything.
            "@container/power rounded-xl border p-5",
            isRunning
              ? "border-primary/25 bg-gradient-to-br from-primary/10 via-card/40 to-card/40"
              : "border-border bg-card/40",
          )}
        >
          {/* Queried, not keyed to the viewport: this card lives in a grid
              column, so on a tablet it is ~500px wide while the viewport is
              1280px. Keyed to `md:` it stayed a row there and squeezed the
              headline into ~275px.

              `@lg` (32rem) and not `@xl`, because a container query measures
              the container's CONTENT box: the section's `p-5` takes 40px off,
              so a 582px card asks its query at 542px. At `@xl` that card —
              which is exactly what a 1280px screen produces once these sit
              two-up — fell a hair short and stacked, leaving a tall card of
              full-width buttons next to a half-empty one. */}
          <div className="flex flex-col gap-5 @lg/power:flex-row @lg/power:items-center @lg/power:justify-between">
            <div className="min-w-0 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className={cn("size-1.5 rounded-full shrink-0", dotClass)} />
                <span
                  className={cn("text-xs font-medium uppercase tracking-wider", headlineClass)}
                >
                  {headline}
                </span>
              </div>

              <span className="text-lg font-medium line-clamp-2">{powerDetail}</span>

              {powerHint && (
                <div className="text-sm text-muted-foreground line-clamp-2">{powerHint}</div>
              )}
            </div>

            {/* Actions, most-wanted first. Off air, the thing you want is a
                mount; once there is one, the thing you want is the mic. */}
            <div className="flex flex-col gap-2 shrink-0 @lg/power:min-w-[190px]">
              {isLive ? (
                <Button asChild className={actionClass}>
                  <a href={`/dashboard/stations/${station.slug}/studio`}>
                    <IconBroadcast size={14} data-icon="inline-start" />
                    Open studio
                  </a>
                </Button>
              ) : isRunning ? (
                <GoLiveTrigger slug={station.slug} name={station.name}>
                  <Button className={actionClass}>
                    <IconBroadcast size={14} data-icon="inline-start" />
                    Take over live
                  </Button>
                </GoLiveTrigger>
              ) : autoDjLocked ? (
                <GoLiveTrigger slug={station.slug} name={station.name}>
                  <Button className={actionClass}>
                    <IconBroadcast size={14} data-icon="inline-start" />
                    Go live
                  </Button>
                </GoLiveTrigger>
              ) : (
                startButton
              )}

              {isRunning ? (
                stopButton
              ) : autoDjLocked ? null : (
                <GoLiveTrigger slug={station.slug} name={station.name}>
                  <Button variant="outline" className={actionClass}>
                    <IconBroadcast size={14} data-icon="inline-start" />
                    Go live
                  </Button>
                </GoLiveTrigger>
              )}
            </div>
          </div>
        </section>

        {/* -------------------------------------------------------------
            Card two: what is on air. Rendered only while the station is up —
            an off-air station has no mount, so a "Now playing" card there
            would be a box permanently reading "nothing", and the card beside
            it already says why. */}
        {isRunning && (
          <section className="rounded-xl border border-border bg-card/40 p-5 flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Now playing
              </span>
              {sourceLabel && (
                <>
                  <span className="text-xs text-muted-foreground/50" aria-hidden="true">·</span>
                  <span
                    className={cn(
                      "text-xs font-medium uppercase tracking-wider",
                      isLive ? "text-emerald-400" : "text-muted-foreground",
                    )}
                  >
                    {sourceLabel}
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1 min-w-0">
              <span className="text-lg font-medium line-clamp-2">{nowPlayingLine}</span>
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

            {upNext && (
              <div className="text-sm text-muted-foreground line-clamp-2">
                Up next: {[upNext.title, upNext.artist].filter(Boolean).join(" — ")}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}
