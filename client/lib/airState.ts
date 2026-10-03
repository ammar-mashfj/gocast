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

export interface AirState {
  tone: AirTone
  /** Mono caps lamp label. */
  label: string
  /** One sentence: what listeners hear, and what to do about it. */
  message: string
  /** The band's button, if it has one. */
  action: AirAction | null
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
}

const OFF_MESSAGE = "Nothing’s playing. Nobody can tune in right now."

export function airState(input: AirInput): AirState {
  const { status, statusLoading, broadcastState, signal, micLatched, autoDjLocked, onStudio } = input

  // ── This tab is on air ────────────────────────────────────────────────
  if (broadcastState === "live" || broadcastState === "reconnecting") {
    const base = { onAir: true, broadcasting: true }
    // Before the first signal sample: live, with nothing to say yet.
    if (!signal) {
      return { ...base, tone: "live", label: "LIVE", message: "You’re live.", action: onStudio ? null : "open-studio" }
    }
    if (signal.tone === "mic") {
      return {
        ...base,
        tone: "mic",
        label: "LIVE · MIC",
        message: signal.detail,
        // A held mic closes when you let go; only a latched one is left open.
        action: micLatched ? "close-mic" : onStudio ? null : "open-studio",
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
    return { ...base, tone: "live", label: "LIVE", message: signal.detail, action: onStudio ? null : "open-studio" }
  }

  // ── Everything else comes from the poll ───────────────────────────────
  const idle = { onAir: false, broadcasting: false }
  const offAction: AirAction = autoDjLocked ? "go-live" : "start-autodj"

  if (!status) {
    return statusLoading
      ? { ...idle, tone: "off", label: "CHECKING", message: "Checking your station…", action: null }
      : { ...idle, tone: "off", label: "NO ANSWER", message: "We can’t reach your station right now. Trying again.", action: null }
  }

  switch (status.state) {
    case "offline":
      return { ...idle, tone: "off", label: "OFF AIR", message: OFF_MESSAGE, action: offAction }
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
  if (status.broadcaster === true || (status.broadcaster === null && status.live_source !== null)) {
    const from =
      status.live_source?.type === "external"
        ? "from your DJ software"
        : status.live_source?.type === "electron"
          ? "from the GoCast app"
          : "from another browser"
    return { onAir: true, broadcasting: false, tone: "live", label: "LIVE", message: `You’re live ${from}.`, action: null }
  }

  if (!status.reachable) {
    return { ...idle, tone: "off", label: "NO ANSWER", message: "Your station isn’t answering. Trying again.", action: null }
  }

  if (status.source === "silence") {
    return {
      onAir: true,
      broadcasting: false,
      tone: "warn",
      label: "SILENCE",
      message: "AutoDJ is on but has nothing to play. Listeners hear silence.",
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
  return { onAir: true, broadcasting: false, tone: "onair", label: "ON AIR · AUTODJ", message, action: "go-live" }
}

/** Button text for each band action. */
export const AIR_ACTION_LABEL: Record<AirAction, string> = {
  "start-autodj": "Start AutoDJ",
  "go-live": "Go live",
  "open-studio": "Open studio",
  "close-mic": "Close mic",
  "add-tracks": "Add tracks",
}
