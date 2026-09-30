"use client"

import { useEffect, useState } from "react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import type { TransportStats } from "@/lib/broadcast"
import { BITRATE_TIERS } from "@/lib/audioEngine"
import { useCoarsePointer } from "@/lib/useCoarsePointer"

/**
 * The One Meaning Rule palette for every lamp: emerald live, sky mic, red
 * fault, grey for the in-between states the go-live page shows. The studio
 * lamp, the banner on other pages and the go-live lamp each used to carry
 * their own copy of this table.
 */
export const SIGNAL_TONE = {
  idle: { strip: "bg-white/[0.03] border-white/[0.08]", chip: "bg-white/[0.07] text-muted-foreground", text: "text-muted-foreground" },
  live: { strip: "bg-live/[0.08] border-live/25", chip: "bg-live text-[#03140d]", text: "text-live-text" },
  mic: { strip: "bg-mic/[0.10] border-mic/30", chip: "bg-mic text-[#04121c]", text: "text-mic-text" },
  fault: { strip: "bg-fault/[0.12] border-fault/40", chip: "bg-fault text-[#1f0404]", text: "text-fault-text" },
} as const

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
    return {
      code: "silence",
      tone: "fault",
      label: "Silence",
      detail: micDisabled
        ? `Nothing is playing. Listeners are connected and hearing nothing — ${
            input === "touch" ? "tap play" : input === "keys" ? "press play (K)" : "open the studio and press play"
          }.`
        : input === "touch"
          ? "Nothing is playing and your mic is closed. Tap play, or press and hold the talk button."
          : input === "keys"
            ? "Nothing is playing and your mic is closed. Press play (K) or hold Space to talk."
            : "Nothing is playing and your mic is closed. Open the studio to press play or talk.",
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
      label: "Mic open",
      detail: engine?.isMicLatched()
        ? input === "keys"
          ? "Your voice is going out live and the mic stays on. Press L or Mic off to close it."
          : `Your voice is going out live and the mic stays on. ${input === "touch" ? "Tap" : "Press"} Mic off to close it.`
        : "Your voice is going out live. The music dips underneath you.",
    }
  }
  return liveSignal(touch)
}
