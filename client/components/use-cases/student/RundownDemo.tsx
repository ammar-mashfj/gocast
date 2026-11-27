"use client"

import { IconCheck, IconHeadphones } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { cn } from "@/lib/utils"
import { demoListeners, useDemoClock } from "../useDemoClock"

/**
 * The student hero: a lunchtime show's running order, worked through live.
 * The ON AIR row moves down, finished items tick off, and the loop starts
 * the next day's show. It's the producer's sheet, not a product screen, so
 * the card says what it is. No play button. Northfield and the students
 * are made up; first names only, as the page advises schools to do.
 */

const RUNDOWN = [
  { at: "12:30", item: "Intro and today’s weather", who: "Maya" },
  { at: "12:33", item: "Campus news: the new library hours", who: "Ethan" },
  { at: "12:37", item: "Interview: the head of science", who: "Maya and Priya" },
  { at: "12:46", item: "Sports results", who: "Jordan" },
  { at: "12:50", item: "Requests from Year 9", who: "Priya" },
  { at: "12:55", item: "Sign-off", who: "Everyone" },
]

const STEP_S = 4

export function RundownDemo() {
  const { ref, secs } = useDemoClock<HTMLDivElement>()
  const at = Math.floor(secs / STEP_S) % RUNDOWN.length

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5">
      <span className="eyebrow-sm px-1 text-text-faint">Preview · today’s lunchtime show</span>
      <div ref={ref} className="flex flex-col gap-4 rounded-card bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-display text-heading">Northfield School Radio</span>
            <StatusLamp tone="live" size="sm" pulse>
              Live from room 14
            </StatusLamp>
          </div>
          <span className="inline-flex items-center gap-2 font-mono text-body-sm tabular-nums text-muted-foreground">
            <IconHeadphones size={16} />
            <span className="text-foreground">{demoListeners(142, secs)}</span>
          </span>
        </div>

        <ol role="list" className="flex flex-col">
          {RUNDOWN.map((r, i) => {
            const done = i < at
            const now = i === at
            return (
              <li
                key={r.at}
                className={cn(
                  "grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-line px-1 py-2.5 transition-colors duration-300",
                  now && "rounded-item border-transparent bg-live-tint px-3",
                )}
              >
                <span className={cn("font-mono text-caption tabular-nums", now ? "text-live-text" : "text-text-faint")}>{r.at}</span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn("truncate text-body-sm font-semibold", done && "text-text-faint line-through decoration-1")}>
                    {r.item}
                  </span>
                  <span className="truncate text-caption text-muted-foreground">{r.who}</span>
                </span>
                {now ? (
                  <span className="eyebrow-sm text-live-text">On air</span>
                ) : done ? (
                  <IconCheck size={16} stroke={3} className="text-ok" />
                ) : (
                  <span className="size-4" />
                )}
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
