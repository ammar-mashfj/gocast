"use client"

import { IconHeadphones } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"
import { airClock, demoListeners, useDemoClock } from "../useDemoClock"

/**
 * The DJ hero's deck: the player mid-set, acted out. No play button — it is
 * a labelled preview, and a button that plays nothing reads as broken.
 * Instead the set moves: each track's waveform fills as it plays, the next
 * title takes over, the count drifts and the clock runs. Nadia K and the
 * tracks are made up.
 */

const SET = [
  "Moodlight — Late Train",
  "Okoro & Vale — Concrete Garden",
  "Sunsetter — Floor Seven",
  "Mira Tan — Hold the Night",
  "Basement Choir — Rise (Dub)",
]

const TRACK_S = 8
const BARS = [
  14, 22, 30, 18, 36, 44, 28, 40, 52, 34, 46, 58, 38, 30, 48, 60, 42, 26, 38, 50, 64, 44, 32, 46, 56, 40, 28, 36, 52,
  60, 46, 34, 24, 40, 54, 44, 30, 20, 34, 48,
]

export function DjDeckDemo() {
  const { ref, secs } = useDemoClock<HTMLDivElement>()
  const track = SET[Math.floor(secs / TRACK_S) % SET.length]
  // How far into this track: the red fill runs left to right over TRACK_S.
  const played = Math.round((((secs % TRACK_S) + 1) / TRACK_S) * BARS.length)
  // Each track gets its own waveform: the same shape, shifted.
  const shift = (Math.floor(secs / TRACK_S) * 7) % BARS.length

  return (
    <div className="flex w-full flex-col gap-2.5 text-left">
      <span className="eyebrow-sm px-1 text-text-faint">Preview · what your listeners see</span>
      <div ref={ref} className="flex w-full flex-col gap-5 rounded-card bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-item bg-live-tint font-display text-title-sm text-live-text">
              N
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <span className="truncate font-display text-heading">Nadia K — Friday Night Live</span>
              <span key={track} className="animate-in fade-in duration-500 truncate text-body-sm text-muted-foreground">
                Now: {track}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-2 font-mono text-body-sm tabular-nums text-muted-foreground">
              <IconHeadphones size={16} />
              <span className="text-foreground">{demoListeners(87, secs)}</span>
            </span>
            <StatusLamp tone="live" variant="solid" pulse>
              Live mix
            </StatusLamp>
          </div>
        </div>
        <div aria-hidden className="flex h-20 items-center gap-[3px] sm:h-24 sm:gap-1">
          {BARS.map((_, i) => {
            const h = BARS[(i + shift) % BARS.length]
            return (
              <span
                key={i}
                className={cn(
                  "flex-1 rounded-xs transition-colors duration-300",
                  i < played ? "bg-live" : "bg-surface-strong",
                  i >= 30 && "max-sm:hidden",
                )}
                style={{ height: `${h + 30}%` }}
              />
            )
          })}
        </div>
        <div className="flex items-center justify-between font-mono text-caption tabular-nums text-text-faint">
          <span>{airClock(72 * 60 + 40, secs)} on air</span>
          <span>gocast.fm/nadia-k</span>
        </div>
      </div>
    </div>
  )
}
