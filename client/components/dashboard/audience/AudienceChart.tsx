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
}

/** Bars get thinner as the window widens; below this they stop being readable. */
const MIN_BAR_PX = 2

export function AudienceChart({ daily, rangeDays }: AudienceChartProps) {
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
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium">Listening time</h3>
        {/* The hovered day replaces the range caption rather than floating
            over the bars: at 90 bars a positioned tooltip spends most of its
            life covering the data it describes. */}
        <div className="text-xs text-muted-foreground tabular-nums">
          {day ? (
            <span className="text-foreground">
              {label(day.day)} — {formatAirtime(day.listener_minutes * 60)}
              {day.peak > 0 && <span className="text-muted-foreground"> · peak {day.peak}</span>}
              {day.listeners > 0 && (
                <span className="text-muted-foreground"> · {day.listeners} listener{day.listeners === 1 ? "" : "s"}</span>
              )}
            </span>
          ) : (
            `Last ${rangeDays} days`
          )}
        </div>
      </div>

      <div
        className="flex items-end gap-px h-28"
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
                "w-full rounded-t-sm transition-colors",
                d.listener_minutes > 0
                  ? hovered === i
                    ? "bg-primary"
                    : "bg-primary/70"
                  : "bg-muted",
              )}
              style={{
                height:
                  d.listener_minutes > 0
                    ? `${Math.max(MIN_BAR_PX, Math.round((d.listener_minutes / peak) * 112))}px`
                    : `${MIN_BAR_PX}px`,
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{label(daily[0].day)}</span>
        <span>{label(daily[daily.length - 1].day)}</span>
      </div>

      {!hasData && (
        <p className="text-xs text-muted-foreground">
          No listening recorded in this window yet.
        </p>
      )}

      {/* Identity is never colour-alone, and a bar chart is not readable by a
          screen reader. Same numbers, same order, no visual weight. */}
      <table className="sr-only">
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
  )
}
