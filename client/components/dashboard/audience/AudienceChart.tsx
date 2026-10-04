"use client"

import { useState } from "react"
import { AudienceDay } from "@/interfaces/Audience"
import { formatAirtime } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Listening time per day.
 *
 * ONE SERIES, ON PURPOSE. Listening time, peak concurrency, arrivals and
 * distinct listeners all live on different scales, and drawing any two of them
 * together needs a second y-axis — the one chart mistake that reliably makes a
 * reader believe a crossover means something. The other three ride in the
 * tooltip instead, where they are read against a day rather than against each
 * other.
 *
 * Listening time is the one plotted because it is the only measure that
 * includes ICECAST listeners: they hold a socket and are counted by polling,
 * so they never produce a session row. A chart of arrivals would quietly omit
 * everyone not on our own web player.
 */
interface AudienceChartProps {
  daily: AudienceDay[]
  rangeDays: number
  /**
   * Shown when no day has any listening time. Supplied by the page because
   * the right sentence depends on what the OTHER cards know: "nobody
   * listened" is false when player-page listens exist that the minute
   * sampler simply hasn't caught, and the page is the one place that holds
   * both figures.
   */
  empty: string
}

/** Bars get thinner as the window widens; below this they stop being readable. */
const MIN_BAR_PX = 2

export function AudienceChart({ daily, rangeDays, empty }: AudienceChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)

  // Never zero, so an empty window divides cleanly and draws a flat floor
  // rather than NaN-height bars.
  const peak = Math.max(...daily.map((d) => d.listener_minutes), 1)
  const hasData = daily.some((d) => d.listener_minutes > 0)

  const day = hovered === null ? null : daily[hovered]

  const label = (iso: string) =>
    // Parsed as UTC, formatted as UTC: the buckets are UTC days, and letting
    // the browser shift them into local time would relabel every bar by one
    // day for anyone west of Greenwich.
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    })

  return (
    <div className="relative flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-heading">Listening time per day</h2>
        {/* The hovered day replaces the range caption rather than floating
            over the bars: at 90 bars a positioned tooltip spends most of its
            life covering the data it describes. */}
        <div className="font-mono text-body-sm text-muted-foreground tabular-nums">
          {day ? (
            <span className="text-foreground">
              {label(day.day)} — {formatAirtime(day.listener_minutes * 60)}
              {day.peak > 0 && <span className="text-muted-foreground"> · peak {day.peak}</span>}
              {day.listeners > 0 && (
                <span className="text-muted-foreground"> · {day.listeners} listener{day.listeners === 1 ? "" : "s"}</span>
              )}
            </span>
          ) : (
            <span>Last {rangeDays} days</span>
          )}
        </div>
      </div>

      <div
        className={cn("flex h-50 items-end border-b border-line", daily.length > 60 ? "gap-0.5" : daily.length > 20 ? "gap-1" : "gap-2.5")}
        onMouseLeave={() => setHovered(null)}
        role="img"
        aria-label={`Listening time per day over the last ${rangeDays} days. Full figures in the table below.`}
      >
        {daily.map((d, i) => (
          <div
            key={d.day}
            // The hit target is the full-height column, not the bar: a quiet
            // day is a 2px sliver, and requiring the pointer to find it would
            // make exactly the days worth investigating the hardest to read.
            className="flex-1 h-full flex items-end min-w-0 cursor-default"
            onMouseEnter={() => setHovered(i)}
          >
            <div
              className={cn(
                cn("w-full transition-colors", daily.length > 60 ? "rounded-t-xs" : "rounded-t-tag"),
                // The mobile Audience chart: past days AutoDJ's dim violet,
                // the day under the pointer (or the latest) lit violet.
                d.listener_minutes > 0
                  ? hovered === i || (hovered === null && i === daily.length - 1)
                    ? "bg-on-air"
                    : "bg-on-air-dim"
                  : "bg-surface-control",
              )}
              style={{
                height:
                  d.listener_minutes > 0
                    ? `${Math.max(MIN_BAR_PX, Math.round((d.listener_minutes / peak) * 196))}px`
                    : `${MIN_BAR_PX}px`,
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-between font-mono text-micro tracking-wider text-text-faint uppercase">
        <span>{label(daily[0].day)}</span>
        {/* The date, not "Today": the buckets are UTC days, and for anyone
            whose midnight isn't UTC's that bar is yesterday for part of
            every day. */}
        <span>{label(daily[daily.length - 1].day)}</span>
      </div>

      {!hasData && (
        <p className="text-body-sm text-muted-foreground">{empty}</p>
      )}

      {/* Identity is never colour-alone, and a bar chart is not readable by a
          screen reader. Same numbers, same order, no visual weight. */}
      {/* sr-only on a wrapper, never on the <table>: a table ignores the 1px
          height and grows to fit its rows, so an sr-only table still pushed
          the document ~1,200px taller. */}
      <div className="sr-only">
        <table>
          <caption>Listening time per day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">Listening time</th>
              <th scope="col">Peak listeners</th>
              <th scope="col">Listeners</th>
            </tr>
          </thead>
          <tbody>
            {daily.map((d) => (
              <tr key={d.day}>
                <th scope="row">{label(d.day)}</th>
                <td>{formatAirtime(d.listener_minutes * 60)}</td>
                <td>{d.peak}</td>
                <td>{d.listeners}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
