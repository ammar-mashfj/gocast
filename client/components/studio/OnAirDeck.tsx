"use client"

import { useEffect, useRef, useMemo, type RefObject } from "react"
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerSkipBackFilled,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatTrackTime as formatTime } from "@/lib/format"
import { PushToTalk } from "./PushToTalk"
import { MonitorBar } from "./MonitorBar"
import { TrackDial } from "./TrackDial"

/** Under this many seconds the clock steps up: time to be ready at the mic. */
const ENDING_SOON_S = 20

/**
 * Talk-up cues: the moments a host needs to be at the mic before the song
 * ends ("hitting the post"). Each fires once as the countdown crosses it.
 */
const CUES_S = [20, 10]

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
 * starting a loop of its own, so the clock, the bar and the loop-point label
 * are always reading the same frame. `onFrame` is held in a ref so a
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
 * listener — and an on-air deck has no cue channel to do that on.
 *
 * Pure markup: the deck owns these nodes and writes them straight from
 * {@link useEngineFrame}, because this ticks sixty times a second and nothing
 * on the page needs to re-render for it.
 */
function ProgressRow({
  ducked,
  barRef,
  elapsedRef,
  durationLabel,
}: {
  ducked: boolean
  barRef: RefObject<HTMLDivElement | null>
  elapsedRef: RefObject<HTMLSpanElement | null>
  durationLabel: string
}) {
  return (
    <div className="flex items-center gap-3 font-mono text-xs text-muted-foreground tabular-nums">
      <span ref={elapsedRef} className="w-10 shrink-0">0:00</span>
      <div className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          ref={barRef}
          className={cn(
            "h-full rounded-full bg-white/80 transition-opacity duration-200",
            ducked && "opacity-35",
          )}
          style={{ width: "0%" }}
        />
      </div>
      <span className="w-10 shrink-0 text-right">{durationLabel}</span>
    </div>
  )
}

/**
 * The on-air console: time left, what is playing, transport, the mic strip
 * and the speaker monitor, as one panel.
 *
 * State (live / mic open / faults) is not drawn here any more — the lamp
 * above owns it, so the deck never contradicts it. The deck used to say
 * "On air — listeners are hearing this" in red, beneath a green banner, and
 * kept saying it through dead air.
 */
export function OnAirDeck({ compact = false }: { compact?: boolean }) {
  const { engine, micDisabled } = useBroadcast()
  const version = useEngineVersion(engine)

  const track = engine?.getCurrentTrack() ?? null
  const playing = engine?.isPlaying() ?? false
  const micActive = engine?.isMicActive() ?? false
  // The engine mutates its queue array in place, so `version` is the real
  // dependency — memoising on it keeps the identity stable between changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queue = useMemo(() => engine?.getQueue() ?? [], [engine, version])
  const currentIndex = engine?.getCurrentIndex() ?? -1
  const repeatMode = engine?.getRepeatMode() ?? "all"

  // Written by the rAF loop below, not rendered by React.
  const barRef = useRef<HTMLDivElement>(null)
  const elapsedRef = useRef<HTMLSpanElement>(null)
  const clockRef = useRef<HTMLSpanElement>(null)
  const clockWrapRef = useRef<HTMLDivElement>(null)
  const loopInRef = useRef<HTMLSpanElement>(null)
  const cueRef = useRef<HTMLParagraphElement>(null)
  const prevLeft = useRef<number | null>(null)

  // Repeat has no 'off' mode, so the queue never runs out — there is no dead
  // air to count down to, only a loop point. With 'one' the current track is
  // also the next one, and under 'all' a single-track queue wraps onto itself;
  // in both cases naming a "next" track would just repeat the title on air.
  const nextTrack = repeatMode === "all" && queue.length > 1 && currentIndex >= 0
    ? queue[(currentIndex + 1) % queue.length]
    : null

  // Everything queued after the current track. `version` is the real
  // dependency, as with `queue` above.
  const restSeconds = useMemo(
    () =>
      currentIndex < 0
        ? 0
        : queue.slice(currentIndex + 1).reduce((sum, t) => sum + t.duration, 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queue, currentIndex, version],
  )

  // The playhead is read per frame, never memoised. Every dependency such a
  // memo could take keeps a stable identity for the life of the deck, so it
  // would compute once at mount and then freeze: that is how the loop line
  // sat at "9m" for an hour while the track actually had 41m left.
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
    if (clockRef.current) {
      clockRef.current.textContent = duration > 0 ? `−${formatTime(left)}` : "−:––"
    }
    if (clockWrapRef.current) {
      const soon = duration > 0 && left <= ENDING_SOON_S
      if (clockWrapRef.current.dataset.soon !== String(soon)) {
        clockWrapRef.current.dataset.soon = String(soon)
      }
    }

    // Talk-up cues. Only a real crossing counts: a skip that lands inside the
    // window, or a track shorter than the cue, starts below it and is not a
    // countdown anyone was following.
    const before = prevLeft.current
    prevLeft.current = duration > 0 ? left : null
    if (before !== null && duration > 0) {
      const cue = CUES_S.find((t) => before > t && left <= t && before - left < 1)
      if (cue !== undefined) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (!reduce) {
          clockWrapRef.current?.animate(
            [
              { transform: "scale(1)", filter: "brightness(1)" },
              { transform: "scale(1.06)", filter: "brightness(1.6)" },
              { transform: "scale(1)", filter: "brightness(1)" },
            ],
            { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
          )
        }
        if (cueRef.current) cueRef.current.textContent = `${cue} seconds left on this track`
      }
    }

    // 'one' never advances, so nothing but the current track stands between
    // here and the loop point.
    if (!loopInRef.current) return
    const label = formatRemaining(repeatMode === "one" ? left : restSeconds + left)
    // This one sits in a wrapping sentence and changes width ("9m" -> "1h
    // 34m"), so writing it every frame would reflow the line sixty times a
    // second for a value that moves once a minute. Compared against the DOM,
    // not a remembered value: a re-render puts React's "—" back in the node,
    // and a cached "already wrote it" left the dash there for good.
    if (loopInRef.current.textContent !== label) loopInRef.current.textContent = label
  })

  return (
    <section
      aria-label="On-air deck"
      // shrink-0: in the phone layout this sits in a scrolling column beside
      // the running order, and flex let it squash until the talk pad was cut.
      className="shrink-0 overflow-hidden rounded-2xl border border-white/[0.09] bg-panel shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)]"
    >
      <div
        className={cn(
          "grid items-center gap-x-6 gap-y-4",
          compact
            ? "grid-cols-[auto_1fr] px-4 py-4"
            : "grid-cols-[auto_minmax(0,1fr)_auto] px-6 py-5",
        )}
      >
        {/* Time left on the track — the number a broadcaster actually waits
            on — inside the ring that drains with it. */}
        <div
          ref={clockWrapRef}
          data-soon="false"
          className={cn("group", !compact && "border-r border-white/[0.06] pr-6")}
        >
          <TrackDial size={compact ? 116 : 148}>
            <span
              ref={clockRef}
              className={cn(
                "font-mono font-medium leading-none tracking-tight tabular-nums text-foreground",
                compact ? "text-[20px]" : "text-[26px]",
              )}
            >
              −:––
            </span>
            <span className="mt-1 text-[11px] text-muted-foreground group-data-[soon=true]:font-semibold group-data-[soon=true]:text-foreground">
              <span className="group-data-[soon=true]:hidden">left</span>
              <span className="hidden group-data-[soon=true]:inline">get ready</span>
            </span>
          </TrackDial>
          <p ref={cueRef} className="sr-only" role="status" />
        </div>

        <div className="flex min-w-0 flex-col gap-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold leading-tight tracking-tight">
              {track?.title ?? "Nothing queued"}
            </h2>
            <p className="truncate text-sm text-muted-foreground">
              {track ? track.artist : "Add files below to start playing"}
            </p>
          </div>

          {track && (
            <ProgressRow
              ducked={micActive}
              barRef={barRef}
              elapsedRef={elapsedRef}
              durationLabel={formatTime(track.duration)}
            />
          )}

          <p className={cn("text-xs", micActive ? "text-mic-text" : "text-muted-foreground")}>
            {micActive ? (
              <>Music dipped while you talk</>
            ) : queue.length === 0 ? (
              <>Nothing queued</>
            ) : currentIndex < 0 ? (
              // Reachable: a queue restored from disk with no saved playhead
              // never auto-starts, and there is a frame after the first add
              // before playIndex(0) lands. Neither has a loop point yet.
              <>Queue loaded — nothing playing yet</>
            ) : (
              <>
                {repeatMode === "one" ? (
                  <>Holding this track</>
                ) : nextTrack ? (
                  <>
                    Then <span className="text-foreground">{nextTrack.title}</span>
                  </>
                ) : (
                  <>Looping this track</>
                )}
                {" · "}
                <span ref={loopInRef} className="text-foreground tabular-nums">
                  —
                </span>{" "}
                {nextTrack ? "until the queue loops" : "until it restarts"}
              </>
            )}
          </p>
        </div>

        <div className={cn("flex items-center gap-2", compact ? "col-span-2 justify-center" : "shrink-0")}>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => engine?.prev()}
            disabled={queue.length === 0}
            aria-label="Previous track"
            aria-keyshortcuts="P"
            title="Previous track (P)"
          >
            <IconPlayerSkipBackFilled />
          </Button>
          <Button
            size="icon"
            className="size-14 rounded-full shadow-[0_8px_18px_-8px_rgba(0,0,0,0.8)]"
            onClick={() => engine?.togglePlay()}
            disabled={queue.length === 0}
            aria-label={playing ? "Pause" : "Play"}
            aria-keyshortcuts="K"
            title={playing ? "Pause (K)" : "Play (K)"}
          >
            {playing ? <IconPlayerPauseFilled className="size-6" /> : <IconPlayerPlayFilled className="size-6" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-11"
            onClick={() => engine?.next()}
            disabled={queue.length === 0}
            aria-label="Next track"
            aria-keyshortcuts="N"
            title="Next track (N)"
          >
            <IconPlayerSkipForwardFilled />
          </Button>
        </div>
      </div>

      {/* Music-only broadcasts have no mic to draw: an empty padded band here
          read as something that failed to load. */}
      {!micDisabled && (
        <div className={cn("border-t border-white/[0.06] transition-colors duration-200", compact ? "px-4 py-4" : "px-6 py-4", micActive && "bg-mic/[0.05]")}>
          <PushToTalk compact={compact} />
        </div>
      )}

      <div className={cn("flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06]", compact ? "px-4 py-3" : "px-6 py-3")}>
        <MonitorBar />
        {micDisabled && (
          <span className="text-xs text-muted-foreground">Music only — no mic in this broadcast</span>
        )}
      </div>
    </section>
  )
}
