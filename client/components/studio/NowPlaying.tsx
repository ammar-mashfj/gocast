"use client"

import { useEffect, useRef, useMemo } from "react"
import {
  IconPlayerPlayFilled,
  IconPlayerPauseFilled,
  IconPlayerSkipForwardFilled,
  IconPlayerSkipBackFilled,
} from "@tabler/icons-react"
import { useBroadcast } from "@/contexts/BroadcastContext"
import { useEngineVersion } from "@/lib/useEngine"
import { cn } from "@/lib/utils"
import { formatTrackTime as formatTime } from "@/lib/format"

/** Under this many seconds the time left turns amber: time to talk it up. */
const ENDING_SOON_S = 15

/**
 * Talk-up cues: the moments a host needs to be at the mic before the song
 * ends ("hitting the post"). Each fires once as the countdown crosses it.
 */
const CUES_S = [20, 10]

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
 * What is playing, how long it has left, what comes next, and the transport:
 * the mobile studio's NowPlaying card.
 *
 * The bar is read-only. The element behind it feeds the live mixer, so
 * moving its playhead is an audible gap and a click for every listener — and
 * an on-air deck has no cue channel to do that on.
 */
export function NowPlaying() {
  const { engine, micDisabled } = useBroadcast()
  const version = useEngineVersion(engine)

  const track = engine?.getCurrentTrack() ?? null
  const playing = engine?.isPlaying() ?? false
  const micActive = !micDisabled && (engine?.isMicActive() ?? false)
  // The engine mutates its queue array in place, so `version` is the real
  // dependency — memoising on it keeps the identity stable between changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queue = useMemo(() => engine?.getQueue() ?? [], [engine, version])
  const currentIndex = engine?.getCurrentIndex() ?? -1
  const repeatMode = engine?.getRepeatMode() ?? "all"

  // Written by the rAF loop below, not rendered by React.
  const barRef = useRef<HTMLDivElement>(null)
  const clockRef = useRef<HTMLSpanElement>(null)
  const clockWrapRef = useRef<HTMLDivElement>(null)
  const cueRef = useRef<HTMLParagraphElement>(null)
  const prevLeft = useRef<number | null>(null)

  // What plays after this track, in the running order's own words (mobile's
  // upNextOf). Repeat has no 'off' mode, so the queue never runs out.
  let nextText: string
  if (queue.length === 0) nextText = "Add music"
  else if (repeatMode === "one") nextText = "Holding this track"
  else if (queue.length === 1) nextText = "Looping this track"
  else {
    const next = queue[(Math.max(0, currentIndex) + 1) % queue.length]
    const label = [next.title, next.artist].filter(Boolean).join(" — ")
    nextText = currentIndex + 1 >= queue.length ? `${label} (from the top)` : label
  }
  const upcoming = Math.max(0, queue.length - Math.max(0, currentIndex) - 1)

  // The playhead is read per frame, never memoised: every dependency such a
  // memo could take keeps a stable identity for the life of the deck, so it
  // would compute once at mount and then freeze.
  useEngineFrame(engine, (eng) => {
    const current = eng.getCurrentTrack()
    const elapsed = eng.getElapsed()
    const duration = current?.duration ?? 0
    const left = Math.max(0, duration - elapsed)

    if (barRef.current) {
      const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0
      barRef.current.style.width = `${pct}%`
    }
    if (clockRef.current) {
      clockRef.current.textContent = duration > 0 ? formatTime(left) : "–:––"
    }
    if (clockWrapRef.current) {
      const soon = duration > 0 && eng.isPlaying() && left < ENDING_SOON_S
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
            [{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }],
            { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
          )
        }
        if (cueRef.current) cueRef.current.textContent = `${cue} seconds left on this track`
      }
    }
  })

  return (
    <section aria-label="Now playing" className="flex flex-col gap-3 rounded-panel bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.75">
          <h2 className="truncate text-heading">
            {track?.title ?? "Nothing queued"}
          </h2>
          <p className="truncate text-body-sm font-medium text-muted-foreground">
            {track ? track.artist || "Unknown artist" : "Add music from the running order"}
          </p>
        </div>
        <div
          ref={clockWrapRef}
          data-soon="false"
          className="group flex shrink-0 flex-col items-end gap-0.5"
        >
          <span
            ref={clockRef}
            className="font-mono text-meter tracking-tight tabular-nums text-foreground group-data-[soon=true]:text-pro"
          >
            –:––
          </span>
          <span className="eyebrow-sm font-medium text-text-faint">LEFT</span>
          <p ref={cueRef} className="sr-only" role="status" />
        </div>
      </div>

      <div className="h-1.25 overflow-hidden rounded-full bg-foreground/8" aria-hidden>
        <div
          ref={barRef}
          className={cn("h-full bg-foreground transition-opacity duration-200", micActive && "opacity-35")}
          style={{ width: "0%" }}
        />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-control bg-background px-3">
          <span className="eyebrow-sm text-text-faint">NEXT</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nextText}</span>
          <span className="rounded-tag bg-muted-foreground px-1.5 py-0.5 font-mono text-micro font-semibold text-background tabular-nums">
            {upcoming}
          </span>
        </div>
        <TransportButton
          label="Previous track"
          shortcut="P"
          disabled={queue.length === 0}
          onClick={() => engine?.prev()}
        >
          <IconPlayerSkipBackFilled size={20} />
        </TransportButton>
        <TransportButton
          label="Next track"
          shortcut="N"
          disabled={queue.length < 2}
          onClick={() => engine?.next()}
        >
          <IconPlayerSkipForwardFilled size={20} />
        </TransportButton>
        <button
          type="button"
          onClick={() => engine?.togglePlay()}
          disabled={queue.length === 0}
          aria-label={playing ? "Pause" : "Play"}
          aria-keyshortcuts="K"
          title={playing ? "Pause (K)" : "Play (K)"}
          className="flex h-12 w-16 shrink-0 items-center justify-center rounded-control bg-foreground text-background transition-transform active:scale-[0.96] disabled:opacity-40"
        >
          {playing ? <IconPlayerPauseFilled size={22} /> : <IconPlayerPlayFilled size={22} />}
        </button>
      </div>
    </section>
  )
}

function TransportButton({
  label,
  shortcut,
  disabled,
  onClick,
  children,
}: {
  label: string
  shortcut: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-keyshortcuts={shortcut}
      title={`${label} (${shortcut})`}
      className="flex size-12 shrink-0 items-center justify-center rounded-control bg-background text-foreground transition-opacity hover:opacity-80 disabled:opacity-40"
    >
      {children}
    </button>
  )
}

/** A music-only show: the pad's place, dimmed, saying why there is no mic. */
export function MusicOnlyPad() {
  return (
    <div className="flex flex-col gap-1.5 rounded-card bg-card/50 p-5">
      <span className="text-display text-text-faint">Music only</span>
      <span className="text-sm font-medium text-text-faint">You picked a music-only show. The mic stays closed.</span>
    </div>
  )
}
