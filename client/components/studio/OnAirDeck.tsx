"use client"

import { useEffect, useCallback, useRef, useMemo, type RefObject } from "react"
import {
  IconMicrophone,
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerSkipBackFilled,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { useAudioLevels } from "@/lib/useAudioLevels"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatTrackTime as formatTime, formatClock } from "@/lib/format"

/** Segment count in the mic meter. Enough to read peaks, few enough to stay crisp. */
const MIC_METER_SEGMENTS = 28

/** "1h 10m" / "4m" — how much audio is left, not a clock time. */
function formatRemaining(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.round((total % 3600) / 60)
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m`
  return "under a minute"
}

type Engine = NonNullable<ReturnType<typeof useBroadcast>["engine"]>

/**
 * The deck's single rAF loop.
 *
 * Everything that follows the playhead runs off this one callback rather than
 * starting a loop of its own, so the bar, the countdown and the loop-point
 * label are always reading the same frame. `onFrame` is held in a ref so a
 * re-render swaps the closure without tearing the loop down and rebuilding it.
 *
 * rAF stops in a hidden tab. That is fine here: nothing accumulates, every
 * value is derived fresh from the engine on the next frame.
 */
function useEngineFrame(engine: Engine | null, onFrame: (engine: Engine) => void) {
  const latest = useRef(onFrame)
  // Intentionally dependency-free: every render swaps in the newest closure,
  // which is what keeps the loop below reading current values without being
  // rebuilt. Declared first, so it lands before the loop starts on mount.
  useEffect(() => {
    latest.current = onFrame
  })

  useEffect(() => {
    if (!engine) return
    let raf = 0
    function tick() {
      latest.current(engine!)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [engine])
}

/**
 * Read-only position display for the track on air.
 *
 * Deliberately not scrubbable. The element behind this bar feeds the live
 * mixer, so moving its playhead is an audible gap and a click for every
 * listener — and an on-air deck has no cue channel to do that on. The
 * broadcaster still needs to see how long is left before they talk, which is
 * all this shows.
 *
 * Pure markup: the deck owns these nodes and writes them straight from
 * {@link useEngineFrame}, because this ticks sixty times a second and nothing
 * on the page needs to re-render for it.
 */
function ProgressRow({
  ducked,
  barRef,
  elapsedRef,
  remainingRef,
}: {
  ducked: boolean
  barRef: RefObject<HTMLDivElement | null>
  elapsedRef: RefObject<HTMLSpanElement | null>
  remainingRef: RefObject<HTMLSpanElement | null>
}) {
  return (
    <div className="flex items-center gap-3">
      <span ref={elapsedRef} className="text-xs text-muted-foreground tabular-nums shrink-0">
        0:00
      </span>
      <div className="flex-1 min-w-[120px] h-1.5 rounded-full bg-destructive/15 overflow-hidden">
        <div
          ref={barRef}
          className={cn(
            "h-full rounded-full bg-primary transition-opacity",
            ducked && "opacity-35",
          )}
          style={{ width: "0%" }}
        />
      </div>
      <span ref={remainingRef} className="text-xs text-muted-foreground tabular-nums shrink-0">
        --:--
      </span>
    </div>
  )
}

/**
 * Mic input meter. Reads the microphone MediaStream directly rather than the
 * engine's mixer analyser, so it shows what the microphone is picking up
 * regardless of where `micGain` currently sits — the answer to "is it hearing
 * me?", which the mixed-bus meter could never give.
 */
function MicMeter({ level, active }: { level: number; active: boolean }) {
  const segments = useMemo(() => Array.from({ length: MIC_METER_SEGMENTS }, (_, i) => i), [])

  return (
    <div className="flex items-center gap-[3px] h-3" aria-hidden>
      {segments.map((i) => {
        const lit = active && i / MIC_METER_SEGMENTS < level
        return (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-[2px] transition-all duration-100",
              lit
                ? i > 23
                  ? "bg-destructive"
                  : i > 19
                    ? "bg-amber-400"
                    : "bg-sky-400"
                : "bg-muted",
            )}
            style={{ height: lit ? `${6 + (i % 5) * 1.4}px` : "3px" }}
          />
        )
      })}
    </div>
  )
}

interface OnAirDeckProps {
  elapsed: number
  listeners: number | null
}

export function OnAirDeck({ elapsed, listeners }: OnAirDeckProps) {
  const { engine, micStream, micDisabled, state } = useBroadcast()
  const version = useEngineVersion(engine)
  const micLevels = useAudioLevels(micStream)

  const track = engine?.getCurrentTrack() ?? null
  const playing = engine?.isPlaying() ?? false
  const micActive = engine?.isMicActive() ?? false
  const latched = engine?.isMicLatched() ?? false
  // The engine mutates its queue array in place, so `version` is the real
  // dependency — memoising on it keeps the identity stable between changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queue = useMemo(() => engine?.getQueue() ?? [], [engine, version])
  const currentIndex = engine?.getCurrentIndex() ?? -1
  const repeatMode = engine?.getRepeatMode() ?? "all"
  const reconnecting = state === "reconnecting"

  // Written by the rAF loop below, not rendered by React.
  const barRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const remainingRef = useRef<HTMLSpanElement>(null)
  const loopInRef = useRef<HTMLSpanElement>(null)
  const lastLoopLabel = useRef("")

  const activate = useCallback(() => {
    if (micDisabled) return
    engine?.pttDown()
  }, [engine, micDisabled])

  const deactivate = useCallback(() => {
    if (micDisabled) return
    engine?.pttUp()
  }, [engine, micDisabled])

  // Space is push-to-talk. Ignored while a latch is holding the mic open, so
  // a stray keyup can't cut the broadcaster off mid-sentence.
  useEffect(() => {
    if (micDisabled) return
    function onDown(e: KeyboardEvent) {
      if (
        e.code === "Space" &&
        !e.repeat &&
        (e.target === document.body || e.target instanceof HTMLButtonElement)
      ) {
        e.preventDefault()
        activate()
      }
    }
    function onUp(e: KeyboardEvent) {
      if (e.code === "Space") deactivate()
    }
    document.addEventListener("keydown", onDown)
    document.addEventListener("keyup", onUp)
    return () => {
      document.removeEventListener("keydown", onDown)
      document.removeEventListener("keyup", onUp)
    }
  }, [activate, deactivate, micDisabled])

  const micLevel = micActive ? Math.max(micLevels.left, micLevels.right) : 0

  // Repeat has no 'off' mode, so the queue never runs out — there is no dead
  // air to count down to, only a loop point. With 'one' the current track is
  // also the next one, and under 'all' a single-track queue wraps onto itself;
  // in both cases naming a "next" track would just repeat the title on air.
  const nextTrack = repeatMode === "all" && queue.length > 1 && currentIndex >= 0
    ? queue[(currentIndex + 1) % queue.length]
    : null

  // Everything queued after the current track. Only the queue can change this,
  // so it stays memoised — but the engine mutates its array in place, so
  // `version` is the real dependency, as with `queue` above.
  const restSeconds = useMemo(
    () =>
      currentIndex < 0
        ? 0
        : queue.slice(currentIndex + 1).reduce((sum, t) => sum + t.duration, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue, currentIndex, version],
  )

  // The playhead is read per frame, never memoised. Every dependency such a
  // memo could take — the engine, its in-place queue array, the current track
  // object — keeps a stable identity for the life of the deck, so it would
  // compute once at mount and then freeze: that is how this line sat at
  // "9m" for an hour while the track actually had 41m left.
  useEngineFrame(engine, (eng) => {
    const current = eng.getCurrentTrack()
    const elapsed = eng.getElapsed()
    const duration = current?.duration ?? 0
    const left = Math.max(0, duration - elapsed)

    if (barRef.current) {
      const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0
      barRef.current.style.width = `${pct}%`
    }
    if (elapsedRef.current) elapsedRef.current.textContent = formatTime(elapsed)
    if (remainingRef.current) {
      remainingRef.current.textContent = duration > 0 ? `-${formatTime(left)}` : "--:--"
    }

    // 'one' never advances, so nothing but the current track stands between
    // here and the loop point.
    if (!loopInRef.current) return
    const label = formatRemaining(repeatMode === "one" ? left : restSeconds + left)
    // Unlike the tabular-nums readouts above, this one sits in a wrapping
    // sentence and changes width ("9m" -> "1h 34m"), so writing it every frame
    // would reflow the line sixty times a second for a value that moves once a
    // minute.
    if (label !== lastLoopLabel.current) {
      lastLoopLabel.current = label
      loopInRef.current.textContent = label
    }
  })

  const warning = micActive
    ? {
        tone: "mic" as const,
        text: "Your voice is going out live. Music is ducked to 20% underneath you.",
      }
    : !playing && queue.length > 0
      ? {
          tone: "dead" as const,
          text: "Dead air. Your stream is live and silent — listeners are hearing nothing right now.",
        }
      : {
          tone: "calm" as const,
          text: "Pausing puts silence on air — listeners stay connected but hear nothing.",
        }

  return (
    <section
      className={cn(
        "rounded-xl border overflow-hidden",
        micActive
          ? "border-sky-500/30 bg-gradient-to-br from-sky-500/[0.06] to-transparent"
          : "border-destructive/25 bg-gradient-to-br from-destructive/[0.06] to-transparent",
      )}
    >
      {/* Status strip */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 flex-wrap px-5 py-2.5 border-b",
          micActive
            ? "bg-sky-500/10 border-sky-500/20"
            : "bg-destructive/10 border-destructive/20",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest",
            micActive ? "text-sky-300" : "text-destructive",
          )}
        >
          <span
            className={cn(
              "size-[7px] rounded-full",
              micActive ? "bg-sky-400" : "bg-destructive",
              !reconnecting && "animate-pulse",
            )}
          />
          {reconnecting
            ? "Reconnecting — nothing is reaching listeners"
            : "On air — listeners are hearing this"}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            Uptime <span className="tabular-nums text-foreground">{formatClock(elapsed)}</span>
          </span>
          <span className="text-border">|</span>
          <span>
            <span className="tabular-nums text-foreground">
              {listeners === null ? "—" : listeners.toLocaleString()}
            </span>{" "}
            listening now
          </span>
        </div>
      </div>

      {/* Now playing + transport */}
      <div className="flex items-center gap-5 flex-wrap px-5 py-4">
        <div className="size-14 rounded-xl bg-gradient-to-br from-[#7c3aed] to-[#2e1065] shrink-0" />

        <div className="flex-1 min-w-[280px] flex flex-col gap-2">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="text-xl font-semibold tracking-tight truncate">
              {track?.title ?? "Nothing queued"}
            </span>
            <span className="text-sm text-muted-foreground italic truncate">
              {track?.artist ?? "Add files to start playing"}
            </span>
          </div>

          {track && (
            <ProgressRow
              ducked={micActive}
              barRef={barRef}
              elapsedRef={elapsedRef}
              remainingRef={remainingRef}
            />
          )}

          <div className={cn("text-xs", micActive ? "text-sky-300" : "text-muted-foreground")}>
            {micActive ? (
              <>Music ducked under your mic</>
            ) : queue.length === 0 ? (
              <>Nothing queued</>
            ) : currentIndex < 0 ? (
              // Reachable: a queue restored from disk with no saved playhead
              // never auto-starts, and there is a frame after the first add
              // before playIndex(0) lands. Neither has a loop point yet.
              <>Queue loaded — nothing on air yet</>
            ) : (
              <>
                {repeatMode === "one" ? (
                  <>Repeating this track</>
                ) : nextTrack ? (
                  <>
                    Then: <span className="text-foreground">{nextTrack.title}</span>
                  </>
                ) : (
                  <>Looping this track</>
                )}
                {" · "}
                <span ref={loopInRef} className="text-amber-400 tabular-nums">
                  —
                </span>{" "}
                {nextTrack ? "until the queue loops" : "until it restarts"}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => engine?.prev()}
            disabled={queue.length === 0}
            aria-label="Previous track"
          >
            <IconPlayerSkipBackFilled />
          </Button>
          <Button
            size="icon"
            className="size-12"
            variant={playing ? "default" : "destructive"}
            onClick={() => engine?.togglePlay()}
            disabled={queue.length === 0}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <IconPlayerPauseFilled /> : <IconPlayerPlayFilled />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => engine?.next()}
            disabled={queue.length === 0}
            aria-label="Next track"
          >
            <IconPlayerSkipForwardFilled />
          </Button>
        </div>
      </div>

      {/* Push to talk */}
      {!micDisabled && (
        <div
          className={cn(
            "flex items-center gap-4 flex-wrap px-5 py-3.5 border-t transition-colors",
            micActive ? "border-sky-500/20 bg-sky-500/[0.07]" : "border-border/60 bg-muted/20",
          )}
        >
          <button
            onMouseDown={activate}
            onMouseUp={deactivate}
            onMouseLeave={deactivate}
            className={cn(
              "flex items-center gap-3 px-4 py-2.5 rounded-xl border select-none cursor-pointer transition-all",
              micActive
                ? "bg-sky-500 border-sky-400 text-sky-950 scale-[0.985]"
                : "border-border hover:bg-muted",
            )}
          >
            <IconMicrophone size={18} />
            <span className="flex flex-col items-start gap-px">
              <span className="text-sm font-semibold">
                {micActive ? "You're on mic" : "Hold to talk"}
              </span>
              <span className="text-[11px] opacity-75">
                {micActive
                  ? latched ? "Latched — click Latch to close" : "Release Space to stop"
                  : "Hold Space · music ducks"}
              </span>
            </span>
          </button>

          <div className="flex-1 min-w-[170px] flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2.5 text-[11px] text-muted-foreground">
              <span>
                {micActive
                  ? "Mic open — mixed into the stream"
                  : "Mic muted — nothing from you is going out"}
              </span>
              <span className="truncate">
                {micStream?.getAudioTracks()[0]?.label || "Default microphone"}
              </span>
            </div>
            <MicMeter level={micLevel} active={micActive} />
          </div>

          <Button
            variant={latched ? "secondary" : "outline"}
            size="sm"
            onClick={() => engine?.setMicLatched(!latched)}
            className={cn(latched && "text-sky-300")}
          >
            {latched ? "Latched on" : "Latch mic"}
          </Button>
        </div>
      )}

      {/* Warning strip */}
      <div
        className={cn(
          "flex items-center gap-2 px-5 py-2.5 border-t text-xs",
          warning.tone === "mic" && "border-sky-500/20 text-sky-300",
          warning.tone === "dead" && "border-destructive/40 bg-destructive/10 text-destructive",
          warning.tone === "calm" && "border-border/60 text-muted-foreground",
        )}
      >
        {warning.text}
      </div>
    </section>
  )
}
