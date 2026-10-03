import type { StationStatus } from "@/interfaces/StationStatus"

/**
 * What the overview's hero says and offers, as one pure answer.
 *
 * The hero is the one place on the station page that owns airtime: it says
 * whether anyone can hear the station, what they're hearing, and holds every
 * control that changes that. The rules below were StationPower's; they live
 * here so each state is a unit test (stationHero.test.ts).
 *
 * Identity ("is somebody on air?") is never read off `state` or `source`:
 * those describe which arm feeds the encoder, which lags a broadcaster by the
 * live arm's buffer at the start of a show and outlasts them by its drain at
 * the end. See `broadcasterAttached`.
 */

export type HeroTone = "off" | "onair" | "live" | "caution"

export type Headline = "live" | "on_air" | "silent" | "off_air" | "starting" | "checking" | "no_answer" | "fault"

export type HeroAction = "go-live" | "open-studio" | "hear-stream" | "start-autodj" | "stop"

export interface HeroInput {
  /** The page payload's coarse state, until the first poll answers. */
  stationState: "offline" | "on_air" | "live"
  status: StationStatus | null
  /** The first status read hasn't answered. */
  loading: boolean
  /** …and has been not answering for a while (10s). */
  slow: boolean
  /** This tab is broadcasting to this station. */
  liveFromThisBrowser: boolean
  autoDjLocked: boolean
  /** The last title seen, held across the gaps between tracks. */
  lastNowPlaying: { title: string | null; artist: string | null } | null
  /** The playlist AutoDJ is on (programme), for the hero's sentence. */
  playlistName: string | null
}

export interface HeroNowPlaying {
  /** A track: title and artist, shown with the progress bar. */
  track: { title: string | null; artist: string | null } | null
  /** Instead of a track: what is happening ("Handing back to AutoDJ soon…"). */
  line: string | null
  /** Draw the AutoDJ progress bar. */
  progress: boolean
  next: string | null
}

export interface Hero {
  headline: Headline
  tone: HeroTone
  /** Mono caps state word. */
  label: string
  /** The 34px line: what this state means for a listener. */
  title: string
  /** What the buttons will do, or what to do instead. */
  text: string | null
  /** Who or what holds the mount, when known: "Live from Mixxx 2.5", "AutoDJ". */
  source: string | null
  nowPlaying: HeroNowPlaying | null
  actions: HeroAction[]
  /** The stop button's words, and whether it asks first. */
  stop: { label: string; confirm: boolean }
  /** Go live is offered but can't be used yet (status unknown while running). */
  goLiveDisabled: boolean
  /** Stop is offered but can't be used yet. */
  stopDisabled: boolean
}

const LABEL: Record<Headline, string> = {
  live: "LIVE",
  on_air: "ON AIR · AUTODJ",
  silent: "NO SOUND",
  off_air: "OFF AIR",
  starting: "STARTING",
  checking: "CHECKING",
  no_answer: "STATUS UNKNOWN",
  // Named for what the listener experiences, not the hop that failed.
  fault: "NOT REACHING LISTENERS",
}

const TONE: Record<Headline, HeroTone> = {
  live: "live",
  on_air: "onair",
  silent: "caution",
  fault: "caution",
  off_air: "off",
  starting: "off",
  checking: "off",
  no_answer: "off",
}

export function stationHero(input: HeroInput): Hero {
  const { status, loading, slow, liveFromThisBrowser, autoDjLocked } = input
  const state = status?.state ?? input.stationState
  const isRunning = state !== "offline"
  const isAutoDj = status?.source === "autodj"
  const statusUnknown = loading && !status

  // Is somebody on air? This tab's own broadcast is certain when true; then
  // the container's `broadcaster` flag; then the open session, for a
  // container too old to report the flag (only while the station runs).
  const broadcasterAttached =
    isRunning &&
    (liveFromThisBrowser || (status?.reachable === true && (status.broadcaster ?? status.live_source !== null)))

  // An encoder has no studio to open: harbor takes one source per mount.
  const liveFromEncoder = broadcasterAttached && status?.live_source?.type === "external"
  const encoderClient = status?.live_source?.client ?? null
  // Live from a browser that isn't this tab. Only when the session SAYS so:
  // an unknown source keeps the stop button, which is the only path to the
  // encoder cut-off for a leaked stream key.
  const liveElsewhere =
    broadcasterAttached &&
    !liveFromThisBrowser &&
    (status?.live_source?.type === "browser" || status?.live_source?.type === "electron")

  // The live arm still airing a broadcaster who has gone (the buffer drain),
  // and its mirror at the start: connected, harbor still filling its buffer.
  const liveTailDraining = !broadcasterAttached && status?.reachable === true && status.source === "live"
  const liveTakingOver = broadcasterAttached && status?.reachable === true && status.source !== "live"

  const statusUnreachable = !status && (!loading || slow)
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
              : !status.reachable
                ? "no_answer"
                : status.source === "silence"
                  ? "silent"
                  : "on_air"

  const source = !isRunning
    ? null
    : broadcasterAttached
      ? liveFromThisBrowser
        ? "Live from this browser"
        : liveFromEncoder
          ? encoderClient
            ? `Live from ${encoderClient}`
            : "Live from an encoder"
          : liveElsewhere
            ? "Live from another browser"
            : "Live"
      : !status?.reachable
        ? null
        : liveTailDraining
          ? "Handing back to AutoDJ"
          : status.source === "autodj"
            ? "AutoDJ"
            : status.source === "silence"
              ? "Silence"
              : null

  // ── Words ─────────────────────────────────────────────────────────────
  let title: string
  let text: string | null
  switch (headline) {
    case "live":
      title = liveFromThisBrowser
        ? "You’re live."
        : liveFromEncoder
          ? `You’re live from ${encoderClient ?? "your DJ software"}.`
          : liveElsewhere
            ? "You’re live from another browser."
            : "Someone is live."
      text = liveTakingOver
        ? "Going on air in a few seconds."
        : liveFromThisBrowser
          ? "Listeners hear you about 15–20 seconds late. Closing this tab ends the broadcast."
          : liveFromEncoder
            ? `Stop broadcasting in ${encoderClient || "your encoder"} to end the show.`
            : liveElsewhere
              ? "End the show from the studio in that browser."
              : null
      break
    case "on_air":
      title = liveTailDraining ? "Your show has ended." : "Your station is playing itself."
      text = liveTailDraining
        ? "Listeners are hearing its last few seconds."
        : `AutoDJ is on${input.playlistName ? ` ${input.playlistName}` : ""}. It hands over when you go live, and takes back when you end.`
      break
    case "silent":
      title = "Nothing is playing."
      text = autoDjLocked ? "Listeners hear silence. Go live to put sound on air." : "Listeners hear silence. Add tracks to AutoDJ’s playlist, or go live."
      break
    case "fault":
      title = "Your station is running, but listeners can’t hear it."
      text = null
      break
    case "starting":
      title = "Your station is starting…"
      text = "Building the audio chain."
      break
    case "checking":
      title = "Checking what’s on air…"
      text = null
      break
    case "no_answer":
      title = status && !status.reachable ? "Waiting for the station to answer." : "Can’t reach the station to check."
      text = "Retrying."
      break
    case "off_air":
      title = "Nothing’s playing right now."
      text = autoDjLocked
        ? "Nobody can tune in. Go live from your browser — nothing to install."
        : "Nobody can tune in. Start AutoDJ to play your music, or go live yourself."
      break
  }

  // ── Now playing: AutoDJ and the seconds around a show, not a live show ──
  let nowPlaying: HeroNowPlaying | null = null
  const upNext = status?.up_next?.[0]
  const next = upNext ? [upNext.title, upNext.artist].filter(Boolean).join(" · ") : null
  const hasRotation = (status?.playlist_length ?? 0) > 0
  if (headline === "on_air") {
    const np = status?.now_playing ?? input.lastNowPlaying
    if (liveTailDraining) {
      nowPlaying = {
        track: null,
        line: !autoDjLocked && hasRotation ? "Handing back to AutoDJ soon…" : "Its last few seconds are playing out.",
        progress: false,
        next: null,
      }
    } else if (np && (np.title || np.artist)) {
      nowPlaying = { track: np, line: null, progress: isAutoDj, next }
    } else {
      nowPlaying = { track: null, line: hasRotation ? "On air — waiting for track info" : null, progress: false, next }
    }
  }

  // ── Actions, most-wanted first ────────────────────────────────────────
  const actions: HeroAction[] = []
  if (state === "live" && !status && !liveFromThisBrowser) {
    // The page says live but the first poll isn't in, so which source is
    // unknown. "Open studio" would be a guess, wrong for every encoder show:
    // offer no lead action for the one poll it takes to find out.
  } else if (headline === "live") {
    actions.push(liveFromThisBrowser ? "open-studio" : "hear-stream")
  } else {
    // Go live leads in every other state. Off air it starts the station too.
    actions.push("go-live")
  }
  if (!liveElsewhere && !liveFromThisBrowser) {
    if (isRunning) actions.push("stop")
    else if (!autoDjLocked) actions.push("start-autodj")
  }

  return {
    headline,
    tone: TONE[headline],
    label: LABEL[headline],
    title,
    text,
    source,
    nowPlaying,
    actions,
    stop: {
      label: headline === "on_air" && isAutoDj ? "Stop AutoDJ" : "Turn station off",
      // Only AutoDJ has listeners to drop; the drain is seconds from over and
      // a silent station has nothing to cut off.
      confirm: headline === "on_air" && isAutoDj && !liveTailDraining,
    },
    goLiveDisabled: isRunning && statusUnknown,
    stopDisabled: statusUnknown,
  }
}
