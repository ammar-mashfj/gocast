"use client"

import { useEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"

/**
 * The dashboard's one bar chart: a column per day, one or more bars in it
 * (Live history puts each show on its day; Audience has one bar a day).
 * Live history and Audience used to draw their own, and they looked like
 * two products. Same anatomy everywhere now:
 *
 *   header — `title` on the left (a heading, or a switch), and on the right
 *            the range ("Last 30 days"), replaced by the day under the
 *            pointer or finger; a floating tooltip over 90 thin bars spent
 *            its life covering the bars it described
 *   y axis — top, half and 0, with faint gridlines
 *   x axis — every day up to two weeks (with weekdays), else about weekly,
 *            always ending on the last day
 *   bars   — coral, rounded tops; an empty day is a faint stub
 *
 * One measure per chart (never two y-axes); switch it in `title` instead.
 */
export interface DayColumn {
  /** Unique, e.g. the ISO date. */
  key: string
  /** The column's date, as noon UTC of that day; labels read it in UTC. */
  date: Date
  /** One per bar, in the order drawn. Empty: the day had nothing. */
  bars: { id: string; value: number }[]
  /** What the header says while this day is hovered or tapped. */
  detail: React.ReactNode
}

const PLOT_PX = 176
const MIN_BAR_PX = 2

export function DayBarChart({
  title,
  range,
  axisLabel,
  columns,
  tick,
  ariaLabel,
  empty,
  className,
  children,
}: {
  title: React.ReactNode
  /** "Last 30 days". */
  range: React.ReactNode
  /** What a bar's height is, over the y axis: "Most listeners at once". */
  axisLabel?: string
  columns: DayColumn[]
  /** A y-axis value as text. */
  tick: (value: number) => string
  ariaLabel: string
  /** Shown under the chart when no bar has a value. */
  empty?: React.ReactNode
  className?: string
  /** Screen-reader extras (a table of the same numbers). */
  children?: React.ReactNode
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const plotRef = useRef<HTMLDivElement>(null)

  // A touch has no "leave": a tap anywhere outside the bars lets the day go.
  useEffect(() => {
    if (hovered === null) return
    const clear = (e: PointerEvent) => {
      if (!plotRef.current?.contains(e.target as Node)) setHovered(null)
    }
    document.addEventListener("pointerdown", clear)
    return () => document.removeEventListener("pointerdown", clear)
  }, [hovered])

  const values = columns.flatMap((c) => c.bars.map((b) => b.value))
  const max = Math.max(1, ...values)
  const hasData = values.some((v) => v > 0)
  const n = columns.length
  const daily = n <= 14
  const dense = n > 60
  // Weekly labels counted back from the last day, so the newest is named.
  // A phone keeps every second or fourth of them: 13 weekly dates over 90
  // days ran into each other at 390px.
  const labelled = (i: number) => daily || (n - 1 - i) % 7 === 0
  const phoneStep = n > 45 ? 28 : 14
  const phoneHidden = (i: number) => !daily && (n - 1 - i) % phoneStep !== 0
  const day = hovered === null ? null : columns[hovered]

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        {title}
        <div className="font-mono text-caption text-muted-foreground tabular-nums sm:text-body-sm">
          {day ? <span className="text-foreground">{day.detail}</span> : range}
        </div>
      </div>

      {axisLabel && (
        <span className="text-body-sm font-semibold" aria-hidden>
          {axisLabel}
        </span>
      )}

      {/* A grid, so the scale is only as wide as its longest number and the
          dates sit under their columns without a guessed indent. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2.5 gap-y-2">
        <div className="flex flex-col justify-between text-right font-mono text-micro text-text-faint tabular-nums" style={{ height: PLOT_PX }} aria-hidden>
          <span className="-mt-1.5">{tick(max)}</span>
          <span>{tick(max / 2)}</span>
          <span className="-mb-1.5">{tick(0)}</span>
        </div>

        <div
          ref={plotRef}
          className={cn("relative flex items-end border-b border-line", dense ? "gap-px" : "gap-0.5 sm:gap-1")}
          style={{ height: PLOT_PX }}
          role="img"
          aria-label={ariaLabel}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setHovered(null)
          }}
        >
          {/* Gridlines at the top and half ticks. */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 border-t border-line/60" />
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-line/60" />
          {columns.map((c, i) => {
            const on = hovered === i
            const dim = hovered !== null && !on
            return (
              <div
                key={c.key}
                // The hit target is the whole column, not the bar: a quiet
                // day is a sliver, and the days worth checking would be the
                // hardest to land on.
                className={cn("relative flex h-full min-w-0 flex-1 items-end justify-center gap-px rounded-t-tag", on && "bg-foreground/[0.06]")}
                // Pointer events, not mouse ones: a tap would fire an
                // emulated mouseenter with no way to undo it. A mouse follows
                // the pointer; a tap picks the day, a second tap lets it go.
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") setHovered(i)
                }}
                onPointerDown={(e) => {
                  if (e.pointerType !== "mouse") setHovered((cur) => (cur === i ? null : i))
                }}
              >
                {c.bars.length === 0 ? (
                  <span className="w-full max-w-5 rounded-t-xs bg-surface-control" style={{ height: MIN_BAR_PX }} />
                ) : (
                  c.bars.map((b) => (
                    <span
                      key={b.id}
                      className={cn(
                        "min-w-0 max-w-5 flex-1 transition-opacity",
                        dense ? "rounded-t-xs" : "rounded-t-tag",
                        b.value > 0 ? "bg-live" : "bg-surface-control",
                        dim && "opacity-55",
                      )}
                      style={{ height: Math.max(MIN_BAR_PX, Math.round((b.value / max) * (PLOT_PX - 4))) }}
                    />
                  ))
                )}
              </div>
            )
          })}
        </div>

        <div className={cn("col-start-2 flex font-mono text-micro text-text-faint tabular-nums", dense ? "gap-px" : "gap-0.5 sm:gap-1")} aria-hidden>
          {columns.map((c, i) => {
            const num = c.date.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" })
            const month = c.date.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })
            return (
              // Labels hang off their column's centre and may spill over
              // the unlabelled neighbours; zero width keeps every column
              // the same size as the bars above.
              <span key={c.key} className="relative flex min-w-0 flex-1 justify-center">
                {labelled(i) && (
                  <span
                    className={cn(
                      "absolute top-0 flex flex-col items-center leading-tight whitespace-nowrap",
                      // The ends are pinned inside the chart rather than
                      // centred half outside it.
                      i === 0 && "left-0 items-start",
                      i === n - 1 && "right-0 items-end",
                      phoneHidden(i) && "max-sm:hidden",
                    )}
                  >
                    {daily ? (
                      <>
                        <span className="text-muted-foreground">{c.date.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</span>
                        <span>{num}</span>
                      </>
                    ) : (
                      <>
                        <span>{num}</span>
                        <span className="uppercase">{month}</span>
                      </>
                    )}
                  </span>
                )}
                {/* Holds the row's height for the absolute labels. */}
                <span className="invisible leading-tight">
                  0<br />0
                </span>
              </span>
            )
          })}
        </div>
      </div>

      {!hasData && empty && <p className="text-body-sm text-muted-foreground">{empty}</p>}
      {children}
    </div>
  )
}
