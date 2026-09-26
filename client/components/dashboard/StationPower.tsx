"use client"

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  IconBroadcast,
  IconHeadphones,
  IconLoader2,
  IconPlayerPlayFilled,
  IconBroadcastOff,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import api from "@/lib/axios"
import { cn } from "@/lib/utils"
import { Station } from "@/interfaces/Station"
import { useAutoDjLocked } from "@/contexts/AccountContext"
import { useStationStatus } from "@/hooks/useStationStatus"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { GoLiveTrigger } from "@/components/dashboard/GoLiveTrigger"
import { HelpLink } from "@/components/dashboard/HelpLink"
import { TrackProgress } from "@/components/dashboard/TrackProgress"

interface StationPowerProps {
  station: Station
  /** A third part for the control strip — the overview puts the listener readout here. */
  aside?: ReactNode
  /** Compact renders the badge + power button only, for headers. */
  compact?: boolean
}

/**
 * The headline pill: PRODUCT.md's state vocabulary, word for word.
 *
 *   LIVE    — a person is broadcasting (emerald)
 *   ON AIR  — the station is up with nobody attached: AutoDJ (Soft Violet)
 *   OFF AIR — nothing is playing (unlit)
 *
 * plus the honest in-between answers: "Starting…" while the container boots,
 * "No sound" when the station is up but its source reports silence (a Free
 * station after the studio leaves, or an empty rotation) — not ON AIR, since
 * nothing is playing,
 * "Checking…" until the first status poll lands, "Status unknown" when the
 * status endpoint stops answering, and "Not reaching listeners" (red) when the
 * container itself reports that its audio is not getting out.
 *
 * Only that last one is a fault. Failing to reach the status endpoint is a
 * fact about this dashboard's connection, not about what listeners hear, so it
 * stays neutral — painting it red would claim an outage we have no evidence of.
 *
 * LIVE is keyed on `broadcasterAttached`, not on `state === "live"`: the
 * routing state lags the person by the live arm's buffer and outlasts them by
 * its drain (see below). A person holding the mount is LIVE whether or not
 * the buffer has filled; the tail of a show that has ended is not.
 *
 * What is making the sound stays a separate line — SOURCE_LABEL below, in the
 * Now playing half ("Live from this browser", "AutoDJ", "Handing back to
 * AutoDJ"). The actions name what they start: "Go live" (a person, and it
 * starts the station itself — ensureStationOnAir in lib/broadcast.ts) and
 * "Start AutoDJ" (the rotation, Pro). They were "Put on air" / "Take over
 * live" / "Take off air", which said nothing about WHAT goes on air to anyone
 * who hasn't run a station; "Turn station off" replaces the last.
 */
type Headline = "live" | "on_air" | "silent" | "off_air" | "starting" | "checking" | "no_answer" | "fault"

const HEADLINE_LABEL: Record<Headline, string> = {
  live: "Live",
  on_air: "On air",
  silent: "No sound",
  off_air: "Off air",
  starting: "Starting…",
  checking: "Checking…",
  no_answer: "Status unknown",
  // Named for what the listener experiences, not for the hop that failed.
  fault: "Not reaching listeners",
}

/** StateBadge tints (DESIGN.md): LIVE emerald 10/25, ON AIR violet 10/30, fault red 10/40, the rest unlit. */
const HEADLINE_CLASS: Record<Headline, string> = {
  live: "border-live/25 bg-live/10 text-live-text",
  on_air: "border-on-air/30 bg-on-air/10 text-on-air",
  silent: "border-white/10 text-muted-foreground",
  off_air: "border-white/10 text-muted-foreground",
  starting: "border-white/10 text-muted-foreground",
  checking: "border-white/10 text-muted-foreground",
  no_answer: "border-white/10 text-muted-foreground",
  fault: "border-fault/40 bg-fault/10 text-fault-text",
}

/**
 * The dot inside the pill. Only a signal that is actually live pulses, plus
 * "Starting…", which pulses neutral (amber is Pro's, never "starting"). A
 * fault holds still.
 */
const HEADLINE_DOT: Record<Headline, string> = {
  live: "bg-live animate-pulse motion-reduce:animate-none",
  on_air: "bg-on-air",
  silent: "bg-muted-foreground/40",
  off_air: "bg-muted-foreground/40",
  starting: "bg-foreground/60 animate-pulse motion-reduce:animate-none",
  checking: "bg-muted-foreground/40",
  no_answer: "bg-muted-foreground/40",
  fault: "bg-fault",
}

/**
 * The one place on the station page that owns airtime.
 *
 * It used to be a power switch sitting next to a separate "Go live" button in
 * the header, which left two adjacent controls both meaning "begin" — and the
 * second silently depending on the first. Everything that changes what
 * listeners hear now lives here: putting the station on air, taking it over
 * live, going off air.
 *
 * Creating a station doesn't start it: a station holds a Liquidsoap container
 * only between start and stop, which is why an off-air station has no mount,
 * no listeners, and no now-playing. Everything below the status line comes
 * from that container directly, so it stops rather than goes stale when the
 * station goes off air.
 *
 * RENDERS TWO CARDS, not one. The first answers "can anyone hear this
 * station?" and owns every control that changes the answer; the second answers
 * "what are they hearing?" and owns the source and the track. They
 * were a single card, which is what let the two questions blur into one — a
 * card headed "Live on air" reads as a station in a different mode rather than
 * a station with a person as its source.
 *
 * They are siblings from ONE component rather than two independently mounted
 * ones because both are views of a single `useStationStatus` poll. Splitting
 * them into separate components would put two timers on the same endpoint and
 * let the two cards disagree with each other mid-poll.
 */
export function StationPower({ station, compact = false, aside }: StationPowerProps) {
  const router = useRouter()
  const { status, loading, refresh } = useStationStatus(station.slug)
  // Until the first poll answers, this card does not know who is on air — so
  // it must not offer controls that act on the answer. After a while without
  // one, "Checking…" stops being true and becomes "can't reach it".
  const statusUnknown = loading && !status
  const [slowStatus, setSlowStatus] = useState(false)
  useEffect(() => {
    if (!statusUnknown) return
    const t = setTimeout(() => setSlowStatus(true), 10_000)
    return () => {
      clearTimeout(t)
      setSlowStatus(false)
    }
  }, [statusUnknown])
  const [pending, setPending] = useState<"start" | "stop" | null>(null)
  // Set when the API refuses a stop because an EXTERNAL encoder is on air.
  // Holds the server's own sentence so the dialog names the software rather
  // than saying "an encoder" over the top of an answer we already have.
  const [cutoffPrompt, setCutoffPrompt] = useState<string | null>(null)
  // Turning off a station that AutoDJ is carrying drops every listener at
  // once, and it was a single unconfirmed click. Asked first only in that
  // case: off a live show the API refuses anyway, and there is nobody to drop
  // from a station that is still starting.
  const [confirmStop, setConfirmStop] = useState(false)

  // Fall back to the coarse state from the station payload until the first
  // poll lands, so the badge doesn't flicker through "unknown" on mount.
  const state = status?.state ?? station.state
  const isRunning = state !== "offline"
  const isLive = state === "live"
  const isAutoDj = status?.source === "autodj"

  // Is the broadcast coming from THIS tab? The broadcast context is per-tab,
  // so a positive answer is certain while a negative one is not.
  //
  // What a negative answer MEANS is now narrower than it used to be. Harbor's
  // `live_connected` reports whether the publisher arrived over the webcast
  // WebSocket or the Icecast source protocol, so an encoder is no longer
  // indistinguishable from another browser tab — see `liveFrom` below. Two
  // browsers on the same station still are, and always will be from here.
  const { state: broadcastState, stationSlug: broadcastSlug } = useBroadcast()
  const liveFromThisBrowser =
    broadcastSlug === station.slug &&
    (broadcastState === "live" || broadcastState === "reconnecting")

  /**
   * IS SOMEBODY ON AIR?
   *
   * One question, one answer, and deliberately NOT derived from `state` or
   * `source`. Those describe which arm is feeding the encoder — a routing
   * decision that changes underneath a broadcaster who has not pressed play
   * yet, and that lags the connection itself by the live arm's 2s buffer.
   * Reading identity off the routing table is what had this card telling
   * people who were live, from this very tab, to go live.
   *
   * Three signals, strongest first:
   *   • this tab's own broadcast context — instant and certain when true,
   *     meaningless when false (the broadcast may be someone else's);
   *   • the container's `broadcaster` flag, which flips the moment harbor
   *     accepts a connection and is the same reading StationAudioPolicy
   *     refuses to auto-stop on;
   *   • `live_source`, for a container too old to report the flag. It reads a
   *     database row that can outlive a container whose `live_disconnected`
   *     was lost, so it is consulted last and only while the station runs.
   */
  const broadcasterAttached =
    isRunning &&
    (liveFromThisBrowser ||
      (status?.reachable === true &&
        (status.broadcaster ?? status.live_source !== null)))

  /**
   * Is the broadcast coming from an external encoder rather than a browser?
   *
   * This is the one distinction the card's ACTIONS turn on, not just its
   * label. There is no studio to open for a BUTT broadcast — harbor allows one
   * source per mount, so the studio could not take over even if it tried — and
   * offering the button anyway sent the owner through two redirects to a page
   * telling them "another browser or device is broadcasting", which is both
   * wrong and no help.
   */
  const liveFromEncoder = broadcasterAttached && status?.live_source?.type === "external"
  const encoderClient = status?.live_source?.client ?? null

  /**
   * Live from a browser that is not this tab: another device, another tab,
   * or a container too old to say. "Open studio" was the wrong offer here —
   * it led to /live, which refuses with "stop that broadcast first", and
   * "Take off air" is refused too, because a browser broadcast has to end
   * from its own studio (ending it from here would only trip that studio's
   * reconnect loop, which starts the station straight back up). So this
   * state gets the one honest instruction and a way to listen, not two dead
   * buttons.
   *
   * Only when the open session SAYS it is a browser. With no `live_source`
   * yet (live_connected not written, or lost to the loopback trap) the source
   * is unknown, and hiding "Turn station off" there removed the only path to
   * the encoder cut-off — for a leaked stream key, the one that matters. The
   * stop button stays; the API names the source in its refusal.
   */
  const liveElsewhere =
    broadcasterAttached &&
    !liveFromThisBrowser &&
    (status?.live_source?.type === "browser" || status?.live_source?.type === "electron")

  // For an encoder we name the software when harbor told us what it was
  // ("Live from Mixxx 2.5.0") and fall back to the category when it did not —
  // an older container, or a client that sends no user-agent.
  const liveFrom = () => {
    if (liveFromThisBrowser) {
      return "Live from this browser"
    }

    if (liveFromEncoder) {
      return encoderClient ? `Live from ${encoderClient}` : "Live from an encoder"
    }

    // Another tab or another machine.
    if (liveElsewhere) {
      return "Live from another browser"
    }

    // Somebody holds the mount but no session says how they connected — too
    // old a container, or live_connected hasn't landed. Guessing "browser"
    // here is what hid the stop button from an encoder broadcast.
    return "Live"
  }

  /**
   * Is the live arm still airing audio from a broadcaster who has already
   * gone?
   *
   * `broadcaster` drops the instant harbor lets go, but the live arm keeps
   * playing out what it had buffered — ~5s of harbor pre-buffer plus the 2s
   * `buffer()`, or ~12s + 2s on a container rendered before that was lowered —
   * so `source` says "live" for a good while afterwards. Those
   * seconds are real: listeners are still hearing the broadcast.
   *
   * Without this the chip blinked out for those seconds and came back, which
   * reads as a glitch rather than as a handover. It is deliberately NOT
   * attributed — `liveFrom()` would name a session that has already closed,
   * which is the "Live from another source" wrongness this whole axis was
   * rebuilt to stop telling.
   */
  const liveTailDraining =
    !broadcasterAttached && status?.reachable === true && status.source === "live"

  /**
   * The drain's mirror image, at the start of a show: somebody is connected,
   * but harbor is still filling its buffer (about five seconds) before the
   * live arm can take the mount, so AutoDJ — or silence — is still what
   * listeners hear, and `now_playing` is still AutoDJ's track. Under a chip
   * that says "Live from this browser", that title reads as the show's.
   */
  const liveTakingOver =
    broadcasterAttached && status?.reachable === true && status.source !== "live"

  /**
   * The SOURCE axis: who or what is holding the mount.
   *
   * Four answers: a broadcaster (named), their audio still draining (unnamed),
   * the rotation, or nothing. Null while we cannot answer honestly — off air,
   * or no reply yet — so the chip is omitted rather than guessed at.
   *
   * A broadcaster outranks the arm: they hold the mount whether or not they
   * are making a sound this second, and saying otherwise is how this chip
   * ended up contradicting the mini controller in the corner of the same
   * screen.
   */
  const sourceLabel = !isRunning
    ? null
    : broadcasterAttached
      ? liveFrom()
      : !status?.reachable
        ? null
        : liveTailDraining
          ? "Handing back to AutoDJ"
          : status.source === "autodj"
            ? "AutoDJ"
            : status.source === "silence"
              ? "Silence"
              : null

  /** LIVE emerald while a person is on air, ON AIR violet for AutoDJ, muted otherwise. */
  // The drain is the last seconds of a show that has ended — the host is
  // gone, so it no longer earns LIVE's emerald. Muted, and named for what is
  // happening, so the panel, its chip and the sign-off card all agree.
  const sourceClass =
    broadcasterAttached
      ? "text-live-text"
      : status?.source === "autodj"
        ? "text-on-air"
        : "text-muted-foreground"

  // Without AutoDJ there is no unattended arm: the station's AutoDJ source is
  // a silence bed, so a station that is on air with nobody broadcasting emits
  // nothing and `stations:sweep` takes it back off within the silence window.
  // "Start AutoDJ" is therefore not a weaker version of "Go live" on this plan —
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

  // Also cleared when a broadcaster arrives or leaves, not only when the
  // station stops. The ref exists to bridge the gap BETWEEN TRACKS on one
  // source; carried across a change of source it does something else
  // entirely — holds the outgoing AutoDJ title under a chip that now names a
  // live DJ, which is the same contradiction in miniature.
  useEffect(() => {
    if (!isRunning) {
      lastNowPlaying.current = null
    } else if (status?.now_playing && !liveTakingOver && !liveTailDraining) {
      // Not across a handover: the title then belongs to the side that is
      // leaving, and holding it would carry it onto the side that arrived.
      lastNowPlaying.current = status.now_playing
    }
  }, [isRunning, status?.now_playing, liveTakingOver, liveTailDraining])

  useEffect(() => {
    lastNowPlaying.current = null
  }, [broadcasterAttached])

  /**
   * Catch the page up with something the go-live dialog learnt first.
   *
   * The same pair as act() below, and for the same reason: the client poll
   * owns the badge, the server render owns Recent Broadcasts and the activity
   * counts, and an encoder connecting changes both. Passed to GoLiveTrigger,
   * which fires it when a broadcaster appears and again on close.
   */
  const syncFromDialog = useCallback(() => {
    void refresh()
    router.refresh()
  }, [refresh, router])

  async function act(
    action: "start" | "stop",
    successMessage: string,
    body?: Record<string, unknown>,
  ) {
    if (pending) return
    setPending(action)
    try {
      await api.post(`/stations/${station.slug}/${action}`, body)
      setCutoffPrompt(null)
      toast.success(successMessage)
      await refresh()
      // The server-rendered page carries desired_state and the badges built
      // from it — refresh so a reload isn't needed to see the new state.
      router.refresh()
    } catch (err) {
      const response = (err as {
        response?: { status?: number; data?: { message?: string; code?: string } }
      })?.response
      // An encoder is on air, and the owner may have no way to reach the
      // machine it is running on — a dead laptop, or a stranger on a leaked
      // stream key. A toast repeating "disconnect it there" is advice they
      // cannot take, so offer the cut-off instead. The studio's plain
      // `station_is_live` deliberately does NOT land here: that broadcast has
      // a Stop button, and it ends the session cleanly.
      if (response?.data?.code === "station_is_live_external") {
        setCutoffPrompt(response.data.message ?? null)
        return
      }
      // The API writes these for humans (plan limits, "end your broadcast
      // first"), so show them rather than a generic failure.
      toast.error(response?.data?.message ?? "Something went wrong — please try again")
    } finally {
      setPending(null)
    }
  }

  /**
   * Which headline, in priority order.
   *
   * A running station with no poll answer yet is "Checking…", not ON AIR: the
   * page payload's coarse state is derived from the owner's intent without
   * asking the container, so it cannot tell a booting, silent or broken
   * station from one listeners can hear. Off air needs no check — a station
   * nobody started has no container to ask.
   *
   * "Status unknown" once the first read has failed, or has hung past the
   * ten-second mark. A read failing AFTER a good one keeps the last answer
   * (useStationStatus holds it), so this is only ever the no-answer-at-all case.
   */
  const statusUnreachable = !status && (!loading || slowStatus)
  const headline: Headline =
    state === "degraded"
      ? "fault"
      : state === "starting"
        ? "starting"
        : broadcasterAttached
          ? "live"
          : !isRunning
            ? "off_air"
            : !status
              ? statusUnreachable
                ? "no_answer"
                : "checking"
              : // A container that isn't answering is not evidence of
                // AutoDJ playing: the violet pill claimed audio nobody knew
                // listeners were hearing.
                !status.reachable
                ? "no_answer"
                : status.source === "silence"
                  ? "silent"
                  : "on_air"
  const dotClass = HEADLINE_DOT[headline]

  const badge = (
    <Badge variant="secondary" className="gap-1.5 shrink-0">
      <span className={cn("size-1.5 rounded-full", dotClass)} />
      <span className="text-xs">{HEADLINE_LABEL[headline]}</span>
      {/* "Live · Live from this browser" says it twice; the pill already has it. */}
      {sourceLabel && headline !== "live" && (
        <>
          <span className="text-xs text-muted-foreground/50" aria-hidden="true">·</span>
          <span className={cn("text-xs", sourceClass)}>{sourceLabel}</span>
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
      onClick={() =>
        // Only AutoDJ has listeners to drop. The drain of a finished show is
        // seconds from over, and a silent station has nothing to cut off.
        headline === "on_air" && isAutoDj ? setConfirmStop(true) : act("stop", "Station is off air")
      }
      disabled={pending !== null || statusUnknown}
      className={actionClass}
    >
      {/* Not the filled stop square: at 14px it read as an empty checkbox. */}
      {pending === "stop" ? (
        <IconLoader2 size={14} className="animate-spin" data-icon="inline-start" />
      ) : (
        <IconBroadcastOff size={15} data-icon="inline-start" />
      )}
      Turn station off
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
      Start AutoDJ
    </Button>
  )

  // Confirmation for the one destructive control this card has. Cutting off
  // an encoder ends a real broadcast for real listeners, so it is never the
  // first click: the owner presses "Turn station off", the API refuses and
  // explains, and only then is this offered.
  const cutoffDialog = (
    <Dialog open={cutoffPrompt !== null} onOpenChange={(open) => !open && setCutoffPrompt(null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cut off this broadcast?</DialogTitle>
          <DialogDescription className="leading-relaxed">
            {cutoffPrompt}{" "}
            Cutting it off takes {station.name} off air immediately and drops
            everyone listening. The encoder will keep trying to reconnect until
            it is stopped — if someone else has your stream key, choose{" "}
            <span className="text-foreground font-medium">New key</span> in
            settings afterwards so they cannot come back.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCutoffPrompt(null)}>
            Leave it on air
          </Button>
          <Button
            variant="destructive"
            disabled={pending !== null}
            onClick={() => act("stop", "Broadcast cut off — station is off air", { force: true })}
          >
            {pending === "stop" && (
              <IconLoader2 size={14} className="animate-spin" data-icon="inline-start" />
            )}
            Cut it off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  const confirmStopDialog = (
    <Dialog open={confirmStop} onOpenChange={setConfirmStop}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Turn {station.name} off?</DialogTitle>
          <DialogDescription className="leading-relaxed">
            AutoDJ stops and anyone listening is cut off; their player shows the
            station as off air. Your music and playlists stay as they are, and
            you can start AutoDJ again any time.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmStop(false)}>
            Keep playing
          </Button>
          <Button
            variant="destructive"
            disabled={pending !== null}
            onClick={async () => {
              await act("stop", "Station is off air")
              setConfirmStop(false)
            }}
          >
            {pending === "stop" && (
              <IconLoader2 size={14} className="animate-spin" data-icon="inline-start" />
            )}
            Turn station off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {cutoffDialog}
        {confirmStopDialog}
        {badge}
        {liveElsewhere ? null : isRunning ? (
          stopButton
        ) : autoDjLocked ? (
          <GoLiveTrigger station={station} isRunning={isRunning} onStatusChanged={syncFromDialog}>
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

  /**
   * The power card's big line: what this state MEANS for a listener. It used
   * to be the track title, which is what made one card try to answer two
   * questions — the track now has a card of its own and this one never
   * mentions it.
   *
   * The one place the strip says it cannot reach the station. The Now
   * playing half used to repeat it word for word; it now shows a dash.
   */
  const powerDetail =
    headline === "fault"
      ? "The station is running, but listeners can't hear it"
      : headline === "starting"
        ? "Building the audio chain…"
        : headline === "off_air"
          ? "Nothing is playing. Nobody can tune in right now"
          : headline === "no_answer"
            ? "Can't reach the station to check — retrying"
            : headline === "checking"
              ? "Checking what's on air…"
              : // No status here means LIVE from this very tab, which the
                // broadcast context vouches for without a poll.
                status && !status.reachable
                ? "Waiting for the station to answer"
                : // The state word above is radio shorthand; this line is
                  // where it gets said in plain words, once, for the state
                  // the station is actually in.
                  headline === "live"
                  ? "A person is broadcasting. Anyone with your link can tune in"
                  : headline === "silent"
                    ? "The station is up, but nothing is playing. Listeners hear silence"
                    : liveTailDraining
                      ? "The show has ended. Listeners are hearing its last few seconds"
                      : "AutoDJ is playing your music. Anyone with your link can tune in"

  /**
   * What the buttons underneath are going to do — or, while an encoder holds
   * the mount, what to do instead, because the only control that can end that
   * broadcast is not in this app.
   */
  //
  // Kept to one short sentence on purpose: this line is `line-clamp-2` inside
  // a card that is ~250px wide in a two-up grid, and the longer version of
  // this ("the studio can't take over while it's connected…") lost its verb to
  // the ellipsis — leaving an owner looking for a stop button with half an
  // instruction. Why the studio is not on offer is explained where it is
  // actually asked, on the go-live page.
  const powerHint = liveFromEncoder
    ? `Stop broadcasting in ${encoderClient || "your encoder"} to end the show.`
    : liveElsewhere
      ? "End the show from the studio in that browser."
      : isRunning
        ? headline === "on_air" && isAutoDj
          ? "Go live and AutoDJ pauses until you finish."
          : headline === "silent"
            ? autoDjLocked
              ? "Go live to put sound on air."
              : "Add tracks to AutoDJ's playlist, or go live."
            : null
        : autoDjLocked
          ? "Go live from your browser. Nothing to install."
          : "Start AutoDJ to play your music, or go live yourself."

  const nowPlaying = status?.now_playing ?? lastNowPlaying.current
  // Both describe the playlist AutoDJ is drawing from right now — a slot's
  // or the default — walked the way the scheduler walks it, so a shuffled
  // playlist's queue is the head of its deck.
  const upNext = status?.up_next?.[0]
  const hasRotation = (status?.playlist_length ?? 0) > 0

  /** The now-playing card's big line: what is coming out of the mount. */
  // Null means "not known": the power half already says why (checking, or
  // can't reach it), so this half shows a dash rather than saying it twice.
  let nowPlayingLine: string | null
  if (state === "starting") {
    nowPlayingLine = "Waiting for audio…"
  } else if (liveTakingOver) {
    nowPlayingLine = status?.source === "autodj"
      ? "Taking over from AutoDJ…"
      : "Going live in a few seconds…"
  } else if (liveTailDraining) {
    // The drain's title is the show's own — its last metadata, or the
    // placeholder a studio broadcast carries — and it is about to be
    // replaced. Showing it as "now playing" presents a show that has ended
    // as the one on air; say what is actually happening instead.
    // Only promised when there is an AutoDJ with something to play; otherwise
    // the drain ends in silence and the station is swept off air.
    nowPlayingLine = !autoDjLocked && hasRotation
      ? "Handing back to AutoDJ soon…"
      : "Your show has ended — its last few seconds are playing out"
  } else if (!status && !nowPlaying && !broadcasterAttached) {
    nowPlayingLine = null
  } else if (nowPlaying) {
    nowPlayingLine = [nowPlaying.title, nowPlaying.artist].filter(Boolean).join(" — ")
  } else if (status && !status.reachable) {
    nowPlayingLine = "Waiting for the station to answer"
  } else if (broadcasterAttached) {
    // A broadcaster only has a title if their software sends one, and the
    // studio sends none. Saying "waiting for track info" would imply
    // something is late; nothing is. What they are playing THROUGH the
    // broadcast is the studio's business, and the studio shows it.
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
    // One control panel, two halves. They were two cards that could sit a
    // column apart; now the power question and the programme question read
    // as one instrument, split by a hairline, and the panel's edge takes the
    // colour of whoever is on air (DESIGN.md: emerald live, violet AutoDJ,
    // red when listeners can't hear it).
    <div
      className={cn(
        "@container/cards overflow-hidden rounded-2xl border bg-panel shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)] transition-colors duration-300",
        // Follows the pill, so "Checking…" does not sit in a lit ON AIR edge.
        headline === "fault"
          ? "border-fault/40"
          : headline === "live"
            ? "border-live/30"
            : headline === "on_air"
              ? "border-on-air/25"
              : "border-white/[0.09]",
      )}
    >
      <div
        className={cn(
          // Queried rather than keyed to the viewport because this sits in a
          // grid column whose width varies independently of the window.
          // Off air the second half is absent and the first spans.
          // minmax(0,…) so an unbroken track name can't widen the panel past
          // the screen — on a phone it pushed the whole overview to 464px.
          "grid grid-cols-[minmax(0,1fr)]",
          isRunning && "@3xl/cards:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]",
          aside && (isRunning
            ? "@5xl/cards:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,15rem)]"
            : "@3xl/cards:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]"),
        )}
      >
        {/* -------------------------------------------------------------
            Card one: is this station on air? Power, and only power. */}
        <section
          aria-label="Station power"
          // Declares the container; the row/column switch lives on the child
          // below. Both used to be on this one element, which is why this
          // half stayed stacked at every width — `@xl/power:` never matched.
          className="@container/power flex flex-col p-5"
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
          {/* Every column of the strip spans its full height the same way:
              label on the top edge, the reading under it, and the secondary
              line pinned to the bottom edge. The listener column always did
              (its "View audience" link sat last); these two stopped short
              and left a dead band under them. */}
          <div className="flex flex-1 flex-col gap-5 @lg/power:flex-row @lg/power:items-stretch @lg/power:justify-between">
            <div className="min-w-0 flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                {/* A state pill (DESIGN.md StateBadge), not a kicker. */}
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                    HEADLINE_CLASS[headline],
                  )}
                >
                  <span className={cn("size-1.5 rounded-full shrink-0", dotClass)} />
                  {HEADLINE_LABEL[headline]}
                </span>
                {/* Announced once per change of headline, the lamp's rule:
                    keyed so a new state is a new node, `alert` only for the
                    one real fault, `status` for everything else — including
                    "Status unknown", which is not a fault (see HEADLINE_LABEL). */}
                <p
                  key={headline}
                  role={headline === "fault" ? "alert" : "status"}
                  className="sr-only"
                >
                  {`Station status: ${HEADLINE_LABEL[headline]}. ${powerDetail}`}
                </p>
                {/* Attached to the STATUS rather than to the card, because the
                    question this answers is "what does this word mean?" —
                    "Not reaching listeners" in particular is a sentence nobody
                    can act on without the article behind it. */}
                <HelpLink
                  article="turning-your-station-on-and-off"
                  label="what each station status means"
                />
              </div>

              <span className="text-lg font-medium line-clamp-2">{powerDetail}</span>

              {powerHint && (
                <div className="mt-auto pt-1 text-sm text-muted-foreground line-clamp-2">{powerHint}</div>
              )}
            </div>

            {/* Actions, most-wanted first. Off air, the thing you want is a
                mount; once there is one, the thing you want is the mic. */}
            {/* The buttons stay together as one group, centred on the
                column's full height, so they sit in the middle of the strip
                whatever the text beside them runs to. */}
            <div className="flex flex-col gap-2 shrink-0 @lg/power:self-center @lg/power:min-w-[190px]">
              {/* An encoder broadcast has no studio to open — harbor takes one
                  source per mount, so the studio could not take over even if
                  it tried, and the button used to send the owner through two
                  redirects to a page saying "another browser or device is
                  broadcasting". The useful thing at this moment is not a
                  control at all: it is hearing what went out. */}
              {/* Live, but the first status poll has not landed, so we do not
                  yet know WHICH source is on air. "Open studio" would be a
                  guess, and it is the wrong one for every encoder broadcast —
                  so offer nothing for the one poll it takes to find out. The
                  pill above already reads "Checking…". */}
              {/* …except when the broadcast is this tab's own, which needs no
                  poll to identify: the studio is the right button, now. */}
              {isLive && !status && !liveFromThisBrowser ? null : broadcasterAttached && !liveFromThisBrowser ? (
                <Button asChild className={actionClass}>
                  <a
                    href={`/station/${station.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <IconHeadphones size={14} data-icon="inline-start" />
                    Hear your stream
                  </a>
                </Button>
              ) : broadcasterAttached ? (
                <Button asChild className={actionClass}>
                  {/* A Link, not an anchor: a full page load would tear
                      down BroadcastProvider and with it the live socket,
                      dropping the broadcast this button returns to. */}
                  <Link href={`/dashboard/stations/${station.slug}/studio`}>
                    <IconBroadcast size={14} data-icon="inline-start" />
                    Open studio
                  </Link>
                </Button>
              ) : isRunning ? (
                <GoLiveTrigger station={station} isRunning={isRunning} onStatusChanged={syncFromDialog}>
                  <Button className={actionClass} disabled={statusUnknown}>
                    <IconBroadcast size={14} data-icon="inline-start" />
                    Go live
                  </Button>
                </GoLiveTrigger>
              ) : autoDjLocked ? (
                <GoLiveTrigger station={station} isRunning={isRunning} onStatusChanged={syncFromDialog}>
                  <Button className={actionClass}>
                    <IconBroadcast size={14} data-icon="inline-start" />
                    Go live
                  </Button>
                </GoLiveTrigger>
              ) : (
                startButton
              )}

              {liveElsewhere ? null : isRunning ? (
                stopButton
              ) : autoDjLocked ? null : (
                <GoLiveTrigger station={station} isRunning={isRunning} onStatusChanged={syncFromDialog}>
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
          <section
            aria-label="Now playing"
            className="flex flex-col gap-1.5 border-t border-white/[0.06] p-5 @3xl/cards:border-l @3xl/cards:border-t-0"
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <h2 className="text-xs font-medium text-muted-foreground">Now playing</h2>
              {sourceLabel && (
                <>
                  <span className="text-xs text-muted-foreground/50" aria-hidden="true">·</span>
                  <span className={cn("text-xs font-semibold", sourceClass)}>{sourceLabel}</span>
                </>
              )}
            </div>

            <div className="flex min-w-0 items-center gap-1">
              {nowPlayingLine === null ? (
                <span className="text-lg font-medium text-muted-foreground">
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">Not known yet</span>
                </span>
              ) : (
                <span className="text-lg font-medium line-clamp-2 [overflow-wrap:anywhere]">{nowPlayingLine}</span>
              )}
            </div>

            {/* Only for AutoDJ. A live broadcast has no track length to
                measure against, and the component renders nothing in that
                case anyway — but mounting it would leave an rAF loop running
                for a bar that can never appear. */}
            {isAutoDj && <TrackProgress status={status} />}

            {upNext && (
              <div className="mt-auto pt-1 text-sm text-muted-foreground line-clamp-2 [overflow-wrap:anywhere]">
                Up next: {[upNext.title, upNext.artist].filter(Boolean).join(" — ")}
              </div>
            )}
          </section>
        )}

        {aside && (
          <div
            className={cn(
              "flex flex-col border-t border-white/[0.06] p-5",
              isRunning
                ? "@3xl/cards:col-span-2 @5xl/cards:col-span-1 @5xl/cards:border-l @5xl/cards:border-t-0"
                : "@3xl/cards:border-l @3xl/cards:border-t-0",
            )}
          >
            {aside}
          </div>
        )}
      </div>
      {cutoffDialog}
      {confirmStopDialog}
    </div>
  )
}
