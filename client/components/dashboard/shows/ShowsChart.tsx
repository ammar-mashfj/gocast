"use client"

import { useState } from "react"
import { formatAirtime } from "@/lib/format"
import { Card } from "@/components/ds/Card"
import { Segmented } from "@/components/ds/Segmented"
import { DayBarChart, type DayColumn } from "@/components/dashboard/charts/DayBarChart"

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

const seconds = (s: RecentShow) => Math.max(0, (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000)

/**
 * The last 30 days of shows: one bar per show, on the day it started (two
 * shows on one day share that day's slot). ONE MEASURE AT A TIME, switched
 * above the chart — peak listeners and time on air are on different scales,
 * and two y-axes on one chart make crossings look meaningful (the same rule
 * as AudienceChart). Drawn by DayBarChart, the same chart as Audience; a
 * hover or tap names the day's shows, and the list under it has the rest.
 */
export function ShowsChart({ shows, timeZone }: { shows: RecentShow[]; timeZone?: string | null }) {
  const [measure, setMeasure] = useState<Measure>("peak")

  // The compact switch (inset, since the small size's own track is the card
  // colour) heads the chart where Audience has its title.
  const title = (
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
  )

  return (
    <Card>
      {RANGES.map((r) => (
        <Plot key={r.count} title={title} shows={shows} count={r.count} measure={measure} timeZone={timeZone} className={r.className} />
      ))}
    </Card>
  )
}

/** One range: its days, a column each, a bar per show that started on it. */
function Plot({
  title,
  shows,
  count,
  measure,
  timeZone,
  className,
}: {
  title: React.ReactNode
  shows: RecentShow[]
  count: number
  measure: Measure
  timeZone?: string | null
  className: string
}) {
  // UTC without a station zone, as the list below does: `undefined` meant
  // the server's zone on the server render and the viewer's in the browser,
  // so the bars moved at hydration and disagreed with the list's days.
  const tz = timeZone || "UTC"
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
  const show = (v: number) => (measure === "peak" ? `peak ${v}` : formatAirtime(v))

  const columns: DayColumn[] = days.map((d) => {
    const vals = d.shows.map(value)
    const when = d.date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    return {
      key: d.key,
      date: d.date,
      bars: d.shows.map((s) => ({ id: s.id, value: value(s) })),
      detail:
        vals.length === 0
          ? `${when} — no show`
          : vals.length === 1
            ? `${when} — ${show(vals[0])}`
            : `${when} — ${vals.length} shows · ${vals.map(show).join(", ")}`,
    }
  })

  return (
    <DayBarChart
      className={className}
      title={title}
      range={`Last ${count} days`}
      axisLabel={measure === "peak" ? "Most listeners at once" : "How long you were on air"}
      columns={columns}
      tick={(n) => (measure === "peak" ? `${Math.round(n)}` : n === 0 ? "0" : formatAirtime(n))}
      ariaLabel={`${measure === "peak" ? "Peak listeners" : "Time on air"} for each show over the last ${count} days. Every show is listed below.`}
      empty={`No shows in the last ${count} days.`}
    />
  )
}
