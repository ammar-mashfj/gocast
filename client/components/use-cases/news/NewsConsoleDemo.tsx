"use client"

import { IconHeadphones } from "@tabler/icons-react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { ProTag } from "@/components/ds/Tag"
import { cn } from "@/lib/utils"
import { demoListeners, useDemoClock } from "../useDemoClock"

/**
 * The news hero's card: the top of the hour, acted out. AutoDJ plays up to
 * 13:59:59, the bulletin starts at 14:00:00 on the dot, runs, and the loop
 * goes round. It shows the Pro on-time start (a recorded bulletin in an
 * "exactly on time" slot), so the card says so. No play button: it is a
 * labelled preview. Riverside News Radio is made up.
 */

const LOOP_S = 30
/** The loop opens this many seconds before the hour. */
const LEAD_S = 15

function stamp(t: number) {
  // t = seconds from 13:00:00
  const h = 13 + Math.floor(t / 3600)
  const m = Math.floor((t % 3600) / 60)
  const s = t % 60
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export function NewsConsoleDemo() {
  const { ref, secs } = useDemoClock<HTMLDivElement>()
  const q = secs % LOOP_S
  const t = 3600 - LEAD_S + q // seconds from 13:00:00
  const news = t >= 3600
  const toGo = 3600 - t

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5">
      <span className="eyebrow-sm px-1 text-text-faint">Preview · the top of the hour</span>
      <div ref={ref} className="flex flex-col gap-5 rounded-card bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate font-display text-heading">Riverside News Radio</span>
          <span className="inline-flex items-center gap-2 font-mono text-body-sm tabular-nums text-muted-foreground">
            <IconHeadphones size={16} />
            <span className="text-foreground">{demoListeners(212, secs, 4)}</span>
          </span>
        </div>

        {/* The station clock: the one number the page is about. */}
        <div className="flex items-end justify-between gap-3">
          <span className="font-mono text-[2.75rem] leading-none font-semibold tracking-tight tabular-nums sm:text-[3.25rem]">
            {stamp(t)}
          </span>
          <span className="pb-1 eyebrow-sm text-text-faint">Station time</span>
        </div>

        <div
          className={cn(
            "flex flex-col gap-1.5 rounded-well p-4 transition-colors duration-300",
            news ? "bg-on-air-tint shadow-[0_0_0_1.5px_var(--color-on-air)]" : "bg-background",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            {news ? (
              <StatusLamp tone="onair" size="sm" pulse>
                On time
              </StatusLamp>
            ) : (
              <StatusLamp tone="onair" size="sm">
                AutoDJ
              </StatusLamp>
            )}
            <span className="font-mono text-caption tabular-nums text-text-faint">
              {news ? `+${t - 3600}s` : `News in ${toGo}s`}
            </span>
          </div>
          <span key={news ? "n" : "m"} className="animate-in fade-in duration-500 text-body font-semibold">
            {news ? "News at 14:00" : "Afternoon music"}
          </span>
          <span className="text-body-sm text-muted-foreground">
            {news ? "Recorded bulletin, read by Sam" : "Ends in time for the bulletin"}
          </span>
        </div>

        <div className="flex items-center gap-2 text-body-sm text-text-faint">
          <ProTag /> A slot set to start exactly on time
        </div>
      </div>
    </div>
  )
}
