"use client"

import { IconHeadphones, IconMapPin } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"
import { demoListeners, useDemoClock } from "../useDemoClock"

/**
 * The community hero: one station, many voices, acted out. Each step is a
 * different presenter on air from a different place, with who's next under
 * it. Live shows are red; the recorded one is AutoDJ violet (a Pro slot).
 * No play button: a labelled preview. Eastside and its people are made up.
 */

const EVENING = [
  { who: "Amira", show: "Kitchen Table Talk", where: "Live from her kitchen", kind: "live" as const },
  { who: "Youth Hour", show: "Four students, one mic", where: "Live from the school hall", kind: "live" as const },
  { who: "Tom", show: "The Folk Show", where: "Recorded on Tuesday", kind: "recorded" as const },
  { who: "Joy", show: "Eastside Tonight", where: "Live from the community centre", kind: "live" as const },
]

const STEP_S = 7

export function CommunityOnAirDemo() {
  const { ref, secs } = useDemoClock<HTMLDivElement>()
  const i = Math.floor(secs / STEP_S) % EVENING.length
  const now = EVENING[i]
  const next = EVENING[(i + 1) % EVENING.length]
  const live = now.kind === "live"

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5">
      <span className="eyebrow-sm px-1 text-text-faint">Preview · one evening on Eastside</span>
      <div ref={ref} className="flex flex-col gap-4 rounded-card bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate font-display text-heading">Eastside Community Radio</span>
          <span className="inline-flex items-center gap-2 font-mono text-body-sm tabular-nums text-muted-foreground">
            <IconHeadphones size={16} />
            <span className="text-foreground">{demoListeners(63, secs)}</span>
          </span>
        </div>

        <div
          key={now.who}
          className={cn(
            "flex animate-in fade-in items-center gap-4 rounded-well p-4 duration-500",
            live ? "bg-live-tint" : "bg-on-air-tint",
          )}
        >
          <span
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-full font-display text-title",
              live ? "bg-live text-live-ink" : "bg-on-air text-live-ink",
            )}
          >
            {now.who[0]}
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            {live ? (
              <StatusLamp tone="live" size="sm" pulse>
                Live now
              </StatusLamp>
            ) : (
              <StatusLamp tone="onair" size="sm">
                On air · recorded
              </StatusLamp>
            )}
            <span className="truncate text-body font-semibold">
              {now.who} — {now.show}
            </span>
            <span className="inline-flex items-center gap-1.5 truncate text-body-sm text-muted-foreground">
              <IconMapPin size={14} className="shrink-0" /> {now.where}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 px-1 text-body-sm">
          <span className="eyebrow-sm text-text-faint">Next</span>
          <span className="truncate text-muted-foreground">
            <span className="font-semibold text-foreground">{next.who}</span> · {next.show}
          </span>
        </div>
      </div>
    </div>
  )
}
