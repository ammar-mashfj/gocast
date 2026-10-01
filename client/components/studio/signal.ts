"use client"

import { useEffect, useState } from "react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import type { TransportStats } from "@/lib/broadcast"
import { BITRATE_TIERS } from "@/lib/audioEngine"
import { useCoarsePointer } from "@/lib/useCoarsePointer"

/**
 * The GoCast Design System's studio status band, for every lamp. The band's
 * fill carries the state; there is no edge:
 *   mic   — LIVE · MIC: red tint, pale-red message. You are talking.
 *   live  — LIVE on music: a dim warm band, plain muted message. The red
 *           chip alone says live, so a healthy show stays calm.
 *   fault — SILENCE and every other "listeners aren't hearing what you
 *           think": amber tint, pale-amber message.
 *   idle  — the go-live page's in-between states: a plain card.
 * Chip text on a red or amber fill is dark ink. The studio lamp, the banner
 * on other pages and the go-live lamp each used to carry their own copy of
 * this table.
 */
export const SIGNAL_TONE = {
  idle: { strip: "bg-card border-transparent", chip: "bg-foreground/[0.07] text-muted-foreground", text: "text-muted-foreground" },
  live: { strip: "bg-live-dim border-transparent", chip: "bg-live text-live-ink", text: "text-muted-foreground" },
  mic: { strip: "bg-live-tint border-transparent", chip: "bg-live text-live-ink", text: "text-live-soft" },
  fault: { strip: "bg-fault-tint border-transparent", chip: "bg-fault text-pro-ink", text: "text-fault-text" },
} as const

/** The lamp chip's type: the design system's mono status label. */
export const LAMP_LABEL = "font-mono font-bold uppercase tracking-[0.08em]"

/** How often the send-path readout samples the transport. */
const HEALTH_POLL_MS = 2000

/** A dropout counts as "just now" for this long after the last lost frame. */
const RECENT_DROP_MS = 5000

export interface TransportHealth {
  stats: TransportStats | null
  /** A frame was dropped within the last {@link RECENT_DROP_MS}. */
  droppingNow: boolean
}

/**
 * Send-path health, sampled on a timer.
 *
 * Read from the transport rather than the mixer: frames are discarded while
 * the WebSocket isn't open, so a meter placed before the encoder kept
 * bouncing happily through a dropped socket. These numbers only count bytes
 * that actually left. The tally changes on every encoded frame, so sampling
 * keeps the readout honest without re-rendering at frame rate.
 */
export function useTransportHealth(enabled: boolean): TransportHealth {
  const { getTransportStats } = useBroadcast()
  const [health, setHealth] = useState<TransportHealth>({ stats: null, droppingNow: false })

  useEffect(() => {
    if (!enabled) return
    const tick = () => {
      const sample = getTransportStats()
      setHealth({
        stats: sample,
        droppingNow:
          !!sample && sample.lastDropAt > 0 && Date.now() - sample.lastDropAt < RECENT_DROP_MS,
      })
    }
    tick()
    const timer = setInterval(tick, HEALTH_POLL_MS)
    return () => clearInterval(timer)
  }, [enabled, getTransportStats])

  return health
}

/**
 * What the studio is doing right now, as one answer.
 *
 * `live` and `mic` are the two healthy states; everything else is a fault —
 * listeners are not hearing what the broadcaster thinks they are. Faults are
 * ranked: a dead socket outranks silence, because pressing play does nothing
 * for a stream that isn't leaving the building.
 */
export type SignalCode =
  | "live"
  | "mic"
  | "reconnecting"
  | "not-sending"
  | "suspended"
  | "silence"
  | "dropping"
  | "slow-connection"

export interface StudioSignal {
  code: SignalCode
  tone: "live" | "mic" | "fault"
  /** Short uppercase lamp label. */
  label: string
  /** One sentence: what listeners hear, and what to do about it. */
  detail: string
}

/**
 * Silence between two pushes of the talk button is not dead air. Without a
 * grace period a talk show would flash the fault lamp every time the host
 * let go of Space.
 */
const SILENCE_GRACE_MS = 4000

/**
 * `inStudio` is false for the banner on every other dashboard page. The
 * studio's keys (K, Space, L) are only bound in the studio, so the advice
 * there names the studio instead of a shortcut that does nothing.
 */
export function useStudioSignal(
  transport: TransportHealth | null,
  { inStudio }: { inStudio: boolean },
): StudioSignal | null {
  const { state, engine, micDisabled } = useBroadcast()
  useEngineVersion(engine)
  const touch = useCoarsePointer()
  const raw = computeSignal(state, engine, micDisabled, transport, !inStudio ? "away" : touch ? "touch" : "keys", touch)
  const silent = raw?.code === "silence"
  const [silenceConfirmed, setSilenceConfirmed] = useState(false)

  useEffect(() => {
    if (!silent) {
      // Reset for the next episode of silence, which gets its own grace.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSilenceConfirmed(false)
      return
    }
    const t = setTimeout(() => setSilenceConfirmed(true), SILENCE_GRACE_MS)
    return () => clearTimeout(t)
  }, [silent])

  if (silent && !silenceConfirmed) return liveSignal(touch)
  return raw
}

/**
 * On a touch device the tab dies long before anyone closes it: a phone pauses
 * a page the moment it leaves the screen, and a paused page sends nothing.
 * So the warning there names what actually ends the show.
 */
function liveSignal(touch: boolean): StudioSignal {
  return {
    code: "live",
    tone: "live",
    label: "Live",
    detail: touch
      ? "Listeners hear you about 15–20 seconds after you speak. Switching apps or locking the screen stops the broadcast."
      : "Listeners hear you about 15–20 seconds after you speak. Closing this tab ends the broadcast.",
  }
}

type Broadcast = ReturnType<typeof useBroadcast>

function computeSignal(
  state: Broadcast["state"],
  engine: Broadcast["engine"],
  micDisabled: boolean,
  transport: TransportHealth | null,
  /** How the advice tells them to act: tap, press a studio key, or go to the studio. */
  input: "touch" | "keys" | "away",
  /** A touch device, wherever the signal is shown — see {@link liveSignal}. */
  touch: boolean,
): StudioSignal | null {
  if (state !== "live" && state !== "reconnecting") return null

  const lostSeconds = transport?.stats ? transport.stats.droppedMs / 1000 : 0
  const micOpen = !micDisabled && (engine?.isMicActive() ?? false)
  const playing = engine?.isPlaying() ?? false

  if (state === "reconnecting") {
    return {
      code: "reconnecting",
      tone: "fault",
      label: "Reconnecting",
      detail: touch
        ? "Nothing is reaching listeners. Keep this tab on screen — it reconnects on its own."
        : "Nothing is reaching listeners. Keep this tab open — it reconnects on its own.",
    }
  }
  // Only trust "not connected" once a sample exists — the first two seconds
  // of a show would otherwise open on a fault.
  if (transport?.stats && !transport.stats.connected) {
    return {
      code: "not-sending",
      tone: "fault",
      label: "Not sending",
      detail: "This browser has stopped sending audio. Listeners hear silence until it reconnects.",
    }
  }
  if (engine?.isSuspended()) {
    return {
      code: "suspended",
      tone: "fault",
      label: "Audio paused",
      detail: "Your browser paused the studio's audio. Click anywhere or press any key to resume.",
    }
  }
  if (!micOpen && !playing) {
    // Worded as the mobile band words it: what is (not) going out, then the
    // one thing to do — which depends on whether there is music to play.
    const queued = (engine?.getQueue().length ?? 0) > 0
    const play = input === "touch" ? "tap play" : input === "keys" ? "press play (K)" : "open the studio and press play"
    const talk = input === "touch" ? "hold the talk pad" : input === "keys" ? "hold Space to talk" : "talk"
    const doThis = micDisabled
      ? queued ? play : "add music to play"
      : queued ? `${play} or ${talk}` : `add music or ${talk}`
    return {
      code: "silence",
      tone: "fault",
      label: "Silence",
      detail: `Nothing is going out. ${doThis.charAt(0).toUpperCase()}${doThis.slice(1)}.`,
    }
  }
  if (transport?.droppingNow) {
    return {
      code: "dropping",
      tone: "fault",
      label: "Dropping audio",
      detail: `Your connection is losing audio — ${lostSeconds.toFixed(1)}s lost so far. Pause other uploads if you can.`,
    }
  }
  // Behind but not yet losing audio: the moment to act, before the drop.
  if (transport?.stats?.congested) {
    const { bitrate } = transport.stats
    // At the lowest tier there is nothing left to step down to.
    const remedy = bitrate === BITRATE_TIERS[BITRATE_TIERS.length - 1]
      ? `The studio is already at its lowest quality (${bitrate} kbps).`
      : `The studio is lowering quality to catch up (now ${bitrate} kbps).`
    return {
      code: "slow-connection",
      tone: "fault",
      label: "Slow connection",
      detail: `Your upload can't keep up, so listeners are falling behind. ${remedy} Pause other uploads or move closer to your Wi-Fi.`,
    }
  }
  if (micOpen) {
    return {
      code: "mic",
      tone: "mic",
      label: "Live · Mic",
      // The mobile band's words. The latch is the "Keep mic open" switch
      // under the talk pad (L on a keyboard).
      detail: engine?.isMicLatched()
        ? input === "keys"
          ? "Mic stays open. Switch off Keep mic open (L) to close."
          : "Mic stays open. Switch off Keep mic open to close."
        : "You\u2019re talking. Music dips under you. Let go to close.",
    }
  }
  return liveSignal(touch)
}
