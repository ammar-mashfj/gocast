import type { StationStatus } from "@/interfaces/StationStatus"
import type { BroadcastState } from "@/lib/broadcast"
import type { StudioSignal } from "@/components/studio/signal"

/**
 * What the station is doing, as the status band, the sidebar lamp and the
 * overview hero say it. One answer from two sources:
 *
 *   - this tab's broadcast (BroadcastContext + the studio signal), which is
 *     first-hand and outranks everything — while you are live from here the
 *     band describes your show, not the poll's slightly older view of it;
 *   - the station status poll, for everything else: AutoDJ, a DJ connected
 *     from other software, a station that is up but not reaching anyone.
 *
 * Pure, so every state is a unit test (airState.test.ts) rather than
 * something to reproduce by hand.
 */

export type AirTone = "off" | "onair" | "live" | "mic" | "warn"

export type AirAction =
  | "start-autodj"
  | "go-live"
  | "open-studio"
  | "close-mic"
  | "add-tracks"
  | "open-playlist"

export interface AirState {
  tone: AirTone
  /** Mono caps lamp label. */
  label: string
  /** One sentence: what listeners hear, and what to do about it. */
  message: string
  /**
   * The same, short enough to share a phone-width row with the lamp and the
   * button. Empty where the lamp says it all (OFF AIR). Absent where the
   * full sentence must be read (faults, warnings): the band then gives it
   * its own row.
   */
  short?: string
  /** The band's button, if it has one. */
  action: AirAction | null
  /** For "open-playlist": the playlist to open. */
  playlistId?: string
  /** On air in any form: the listener count means something. */
  onAir: boolean
  /** This tab is broadcasting: the band shows the uptime and the transport. */
  broadcasting: boolean
}

export interface AirInput {
  status: StationStatus | null
  /** The first status read hasn't answered yet. */
  statusLoading: boolean
  broadcastState: BroadcastState
  /** The studio's own reading of this tab's show (useStudioSignal). */
  signal: StudioSignal | null
  micLatched: boolean
  /** Unknown plan counts as unlocked, as everywhere else (useAutoDjLocked). */
  autoDjLocked: boolean
  /** The band is on the studio page, which has its own controls. */
  onStudio: boolean
  /**
   * This tab's show just ended and the station is still handing over (see
   * StationStatusContext). The status in hand is about to change.
   */
  showEnding?: boolean
}

// Off air says how to get on, not what off air means: the label already does.
const offMessage = (autoDjLocked: boolean) =>
  autoDjLocked ? "Go live to put your station on air." : "Start AutoDJ or go live to put your station on air."

/**
 * Is somebody broadcasting to the station, as far as the status poll can say?
 * The one answer the status band and the overview hero both read, so they
 * can't disagree.
 *
 * The container's `broadcaster` flag, or for a container too old to report
 * it, the open session. Only from a container that answered: `live_source`
 * comes from Laravel's session row, which an unreachable container can't
 * confirm, so that is "no answer", not "live".
 */
export function broadcasterOnAir(status: StationStatus): boolean {
  return status.reachable === true && (status.broadcaster ?? status.live_source !== null)
}

export function airState(input: AirInput): AirState {
  const { status, statusLoading, broadcastState, signal, micLatched, autoDjLocked, onStudio, showEnding } = input

  // ── This tab is on air ────────────────────────────────────────────────
  if (broadcastState === "live" || broadcastState === "reconnecting") {
    const base = { onAir: true, broadcasting: true }
    // Before the first signal sample: live, with nothing to say yet.
    if (!signal) {
      return { ...base, tone: "live", label: "LIVE", message: "You’re live.", short: "", action: onStudio ? null : "open-studio" }
    }
    if (signal.tone === "mic") {
      return {
        ...base,
        tone: "mic",
        label: "LIVE · MIC",
        message: signal.detail,
        short: "Your mic is on.",
        // A held mic closes when you let go; only a latched one is left
        // open — and on the studio its own controls close it (the floating
        // talk button on a phone, Keep mic open elsewhere), so the band adds
        // no second Close mic there.
        action: onStudio ? null : micLatched ? "close-mic" : "open-studio",
      }
    }
    if (signal.tone === "fault") {
      return {
        ...base,
        tone: "warn",
        label: signal.label.toUpperCase(),
        message: signal.detail,
        action: onStudio ? null : "open-studio",
      }
    }
    return { ...base, tone: "live", label: "LIVE", message: signal.detail, short: signal.short ?? "", action: onStudio ? null : "open-studio" }
  }

  // ── Everything else comes from the poll ───────────────────────────────
  const idle = { onAir: false, broadcasting: false }

  // The status still describes the show that just ended: no guessing from it.
  if (showEnding) {
    return { ...idle, tone: "off", label: "SHOW ENDED", message: "Your show has ended. Checking what’s on air now…", short: "Show ended. Checking…", action: null }
  }
  const offAction: AirAction = autoDjLocked ? "go-live" : "start-autodj"

  if (!status) {
    return statusLoading
      ? { ...idle, tone: "off", label: "CHECKING", message: "Checking your station…", action: null }
      : { ...idle, tone: "off", label: "NO ANSWER", message: "We can’t reach your station right now. Trying again.", short: "Can’t reach your station.", action: null }
  }

  switch (status.state) {
    case "offline":
      return { ...idle, tone: "off", label: "OFF AIR", message: offMessage(autoDjLocked), short: "", action: offAction }
    case "starting":
      return { ...idle, tone: "off", label: "STARTING", message: "Your station is starting up.", action: null }
    case "degraded":
      return {
        onAir: true,
        broadcasting: false,
        tone: "warn",
        label: "NOT HEARD",
        message: "Your station is running, but listeners can’t hear it right now.",
        action: null,
      }
  }

  // A broadcaster from somewhere other than this tab: DJ software, the app,
  // or another browser.
  if (broadcasterOnAir(status)) {
    const from =
      status.live_source?.type === "external"
        ? "from your DJ software"
        : status.live_source?.type === "electron"
          ? "from the GoCast app"
          : "from another browser"
    return { onAir: true, broadcasting: false, tone: "live", label: "LIVE", message: `You’re live ${from}.`, short: "", action: null }
  }

  if (!status.reachable) {
    return { ...idle, tone: "off", label: "NO ANSWER", message: "Your station isn’t answering. Trying again.", short: "Station not answering.", action: null }
  }

  // The live feed is still what listeners hear, but nobody is connected: a
  // show from DJ software, the app or another browser has just ended, and the
  // station is playing out its last few seconds before handing over. Without
  // this the read fell through to "AutoDJ is playing", on Free too. Same
  // words as the overview hero's liveTailDraining (lib/stationHero).
  if (status.source === "live") {
    return {
      onAir: true,
      broadcasting: false,
      tone: "off",
      label: "SHOW ENDED",
      message: "Your show has ended. Listeners are hearing its last few seconds.",
      short: "Show ended.",
      action: null,
    }
  }

  if (status.source === "silence") {
    // The checklist turned the station on and the host is about to go live:
    // the silence is the gap before their show, not AutoDJ running dry (an
    // account without AutoDJ has none to run dry).
    if (broadcastState === "ready" || broadcastState === "connecting") {
      return {
        onAir: true,
        broadcasting: false,
        tone: "off",
        label: "GOING LIVE",
        // Seconds at most: the checks are done or nearly, and the show is
        // about to connect. Not "waiting for you" — nothing is waiting on
        // the host here.
        message: "Getting you on air…",
        short: "Getting you on air…",
        action: null,
      }
    }
    // Without AutoDJ there is nothing to "run dry": the station is up and
    // nobody is broadcasting to it (a studio that left, a show that ended).
    if (autoDjLocked) {
      return {
        onAir: true,
        broadcasting: false,
        tone: "warn",
        label: "SILENCE",
        message: "Your station is on, but nobody is live. Listeners hear silence.",
        short: "Listeners hear silence.",
        action: "go-live",
      }
    }
    // The playlist AutoDJ should be playing is empty: name it, and open it.
    // Not "add tracks": the library may be full and the default (or a slot)
    // pointed at an empty playlist. An empty library lands here too, and the
    // playlist page's Add tracks uploads straight into it.
    const playlist = status.playlist
    if (playlist && status.playlist_length === 0) {
      return {
        onAir: true,
        broadcasting: false,
        tone: "warn",
        label: "SILENCE",
        message: playlist.scheduled
          ? `The scheduled playlist, ${playlist.name}, is empty. Listeners hear silence.`
          : `Your default playlist, ${playlist.name}, is empty. Listeners hear silence.`,
        // Phones and tablets: a name can be any length, and the page the
        // button opens shows it.
        short: "Playlist is empty.",
        action: "open-playlist",
        playlistId: playlist.id,
      }
    }
    return {
      onAir: true,
      broadcasting: false,
      tone: "warn",
      label: "SILENCE",
      message: "AutoDJ is on but has nothing to play. Listeners hear silence.",
      // Phones and tablets: the lamp says SILENCE and the button says Add
      // tracks, so two words carry the rest and the band stays one row.
      short: "Nothing to play.",
      action: "add-tracks",
    }
  }

  const np = status.now_playing
  const message =
    np?.title && np.artist
      ? `AutoDJ is playing ${np.title} by ${np.artist}.`
      : np?.title
        ? `AutoDJ is playing ${np.title}.`
        : "AutoDJ is playing."
  // short "": the lamp already says AUTODJ; on phones the sentence only crowded the row.
  // No action: "Go live" beside an on-air lamp reads as "you're not on air";
  // the Overview card offers "Go live over AutoDJ" instead.
  return { onAir: true, broadcasting: false, tone: "onair", label: "ON AIR · AUTODJ", message, short: "", action: null }
}

/** Button text for each band action. */
export const AIR_ACTION_LABEL: Record<AirAction, string> = {
  "start-autodj": "Start AutoDJ",
  "go-live": "Go live",
  "open-studio": "Open studio",
  "close-mic": "Close mic",
  "add-tracks": "Add tracks",
  "open-playlist": "Open playlist",
}
