"use client"

import { IconHeadphones } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"
import { airClock, demoListeners, useDemoClock } from "../useDemoClock"

/**
 * The church hero's card: what a member sees on Sunday morning, acted out.
 * There is no play button on purpose — it is a preview, labelled as one,
 * and a button that plays nothing reads as broken. Instead the station
 * behaves like one: the service moves on, the count drifts, the clock runs.
 * Grace Chapel and everything on the card are made up.
 */

const ORDER = [
  { now: "Welcome and notices", by: "Pastor Ruth" },
  { now: "Hymn: Amazing Grace", by: "Choir and congregation" },
  { now: "Reading: Luke 10:25–37", by: "Read by Daniel" },
  { now: "Sermon: Love your neighbour", by: "Pastor Ruth" },
  { now: "Prayers of the people", by: "Led by Grace" },
  { now: "Hymn: Be Thou My Vision", by: "Choir and congregation" },
]

const STEP_S = 6
const EQ = [0.55, 0.9, 0.7, 1, 0.6]

export function ChurchPlayerDemo() {
  const { ref, secs } = useDemoClock<HTMLDivElement>()
  const part = ORDER[Math.floor(secs / STEP_S) % ORDER.length]

  return (
    <div className="flex w-full max-w-sm flex-col gap-2.5">
      <span className="eyebrow-sm px-1 text-text-faint">Preview · what members see on Sunday</span>
      <div
        ref={ref}
        className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-[0_24px_60px_-30px_rgb(0_0_0/0.6)]"
      >
        <div className="flex items-center gap-3.5">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-item bg-on-air-tint font-display text-title text-on-air-text">
            G
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <span className="truncate font-display text-heading">Grace Chapel Radio</span>
            <StatusLamp tone="live" size="sm" pulse>
              Live
            </StatusLamp>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-well bg-background p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="eyebrow-sm text-text-faint">Now</span>
            {/* A level that moves with the clock: there is sound, without a button that pretends to play it. */}
            <span aria-hidden className="flex h-3.5 items-end gap-[2px]">
              {EQ.map((b, i) => (
                <span
                  key={i}
                  className="w-[3px] rounded-xs bg-live transition-[height] duration-700"
                  style={{ height: `${Math.round((0.35 + 0.65 * Math.abs(Math.sin(secs * 1.3 + i * 1.1))) * b * 100)}%` }}
                />
              ))}
            </span>
          </div>
          {/* key re-mounts the lines so each part fades in as it starts. */}
          <span key={part.now} className="animate-in fade-in duration-500 text-body font-semibold">
            {part.now}
          </span>
          <span key={part.by} className="animate-in fade-in duration-500 text-body-sm text-muted-foreground">
            {part.by}
          </span>
        </div>

        <div className="flex items-center justify-between font-mono text-body-sm tabular-nums">
          <span className="text-text-faint">On air {airClock(47 * 60 + 12, secs)}</span>
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <IconHeadphones size={16} />
            <span className={cn("text-foreground")}>{demoListeners(48, secs)}</span> listening
          </span>
        </div>
        <span className="truncate font-mono text-caption text-text-faint">gocast.fm/grace-chapel</span>
      </div>
    </div>
  )
}
