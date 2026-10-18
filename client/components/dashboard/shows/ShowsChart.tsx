"use client"

import { useState } from "react"
import { formatAirtime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ds/Card"
import { Segmented } from "@/components/ds/Segmented"

export interface RecentShow {
  id: string
  started_at: string
  ended_at: string
  peak_listeners: number
}

type Measure = "peak" | "time"

/**
 * The API sends 30 days; a PC shows them all, a tablet two weeks, a phone
 * one — 30 columns on a smaller screen were too thin to read. All three are
 * rendered and CSS shows the one that fits, so the first paint is already
 * right (picking in JS drew 30 days, then swapped, a visible flicker).
 */
const RANGES = [
  { count: 7, className: "sm:hidden" },
  { count: 14, className: "max-sm:hidden lg:hidden" },
  { count: 30, className: "max-lg:hidden" },
] as const
const BAR_AREA_PX = 176
const MIN_BAR_PX = 3

const seconds = (s: RecentShow) => Math.max(0, (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000)

/**
 * The last 30 days of shows: one bar per show, on the day it started (two
 * shows on one day share that day's slot). ONE MEASURE AT A TIME, switched
 * above the chart — peak listeners and time on air are on different scales,
 * and two y-axes on one chart make crossings look meaningful (the same rule
 * as AudienceChart). Just the picture: no hover, nothing to tap; the
 * list under it has every show's numbers.
 */
export function ShowsChart({ shows, timeZone }: { shows: RecentShow[]; timeZone?: string | null }) {
  const [measure, setMeasure] = useState<Measure>("peak")

  return (
    <Card className="gap-4">
      {/* One row at every width: the compact switch (inset, since the small
          size's own track is the card colour) and the range beside it. */}
      <div className="flex items-center justify-between gap-3">
        <Segmented
          size="sm"
          className="bg-surface-inset"
          aria-label="What the bars show"
          value={measure}
          onChange={setMeasure}
          options={[
            {
              value: "peak",
              // Phones: just "Listeners"; the axis title says it's the most at once.
              label: (
                <>
                  <span className="max-sm:hidden">Peak listeners</span>
                  <span className="sm:hidden">Listeners</span>
                </>
              ),
            },
            { value: "time", label: "Time on air" },
          ]}
        />
        <div className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums sm:text-body-sm">
          {RANGES.map((r) => (
            <span key={r.count} className={r.className}>
              Last {r.count} days
            </span>
          ))}
        </div>
      </div>

      {/* The axes say what they are: the up axis what a bar's height is,
          the bottom one that each bar sits on the day the show started. */}
      <div className="flex flex-col gap-2">
        <span className="text-body-sm font-semibold" aria-hidden>
          {measure === "peak" ? "Most listeners at once" : "How long you were on air"}
        </span>
        {RANGES.map((r) => (
          <Plot key={r.count} shows={shows} count={r.count} measure={measure} timeZone={timeZone} className={r.className} />
        ))}
      </div>
    </Card>
  )
}

/** One range's bars, scale and dates. */
function Plot({
  shows,
  count,
  measure,
  timeZone,
  className,
}: {
  shows: RecentShow[]
  count: number
  measure: Measure
  timeZone?: string | null
  className: string
}) {
  const tz = timeZone || undefined
  const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: tz })
  // Calendar days, stepped as dates rather than as 24h of milliseconds: a
  // 23-hour spring-forward day, stepped over by 24h, vanished from the
  // window (its column and its shows) for the first hour of each day after
  // it. Today's date in the station's zone, then back one date at a time;
  // `date` is that day's noon UTC, labelled in UTC, so it names the same day.
  const [y, m, d0] = dayKey(new Date()).split("-").map(Number)
  const days = Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, d0 - (count - 1 - i), 12))
    return { key: date.toISOString().slice(0, 10), date, shows: [] as RecentShow[] }
  })
  const byKey = new Map(days.map((d) => [d.key, d]))
  for (const s of shows) byKey.get(dayKey(new Date(s.started_at)))?.shows.push(s)

  const value = (s: RecentShow) => (measure === "peak" ? s.peak_listeners : seconds(s))
  const shown = days.flatMap((d) => d.shows)
  const max = Math.max(1, ...shown.map(value))

  const tick = (n: number) => (measure === "peak" ? `${Math.round(n)}` : n === 0 ? "0" : formatAirtime(n))

  // A grid, so the scale is only as wide as its longest number and the
  // dates line up under the bars without a guessed indent.
  return (
    <div className={cn("grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-2.5", className)}>
      <div
        className="flex shrink-0 flex-col justify-between pb-px text-right font-mono text-micro text-text-faint tabular-nums"
        aria-hidden
      >
        <span className="-mt-1.5">{tick(max)}</span>
        <span>{tick(max / 2)}</span>
        <span className="-mb-1.5">0</span>
      </div>
      <div
        className="flex min-w-0 flex-1 items-end gap-0.5 border-b border-line sm:gap-1"
        style={{ height: BAR_AREA_PX }}
        role="img"
        aria-label={`${measure === "peak" ? "Peak listeners" : "Time on air"} for each show over the last ${count} days. Every show is listed below.`}
      >
        {days.map((d) => (
          <div key={d.key} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px">
            {d.shows.map((s) => {
              const v = value(s)
              return (
                <span
                  key={s.id}
                  className={cn("max-w-4 min-w-0 flex-1 rounded-t-tag", v > 0 ? "bg-live" : "bg-surface-control")}
                  style={{
                    height: `${Math.max(MIN_BAR_PX, Math.round((v / max) * (BAR_AREA_PX - 4)))}px`,
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>

      <div className="col-start-2 flex flex-col gap-1.5" aria-hidden>
        {/* Every day gets its number, under its own column, and the month
        where it starts (the first column and each 1st). Two weeks or
        less (tablet, phone) also get the weekday. */}
        <div className="flex gap-0.5 font-mono text-micro text-text-faint tabular-nums sm:gap-1">
          {days.map((d, i) => {
            const n = d.date.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" })
            const month = i === 0 || n === "1" ? d.date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) : null
            return (
              <span key={d.key} className="flex min-w-0 flex-1 flex-col items-center leading-tight">
                {count <= 14 && (
                  <span className="text-muted-foreground">{d.date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</span>
                )}
                <span>{n}</span>
                <span className="text-muted-foreground uppercase">{month ?? "\u00a0"}</span>
              </span>
            )
          })}
        </div>
        <span className="text-center text-body-sm font-semibold">Day of the show</span>
        {shown.length === 0 && <p className="text-center text-body-sm text-muted-foreground">No shows in the last {count} days.</p>}
      </div>
    </div>
  )
}
