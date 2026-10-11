"use client"

import { useState } from "react"
import { SWATCHES } from "@/lib/playlistSwatches"
import { cn } from "@/lib/utils"
import { DAY_LABEL, DAY_NAME, MINUTES_PER_DAY, PLAYLISTS, SEGMENTS, WEEK_ORDER, hhmm, type Now, type Segment } from "./weekMock"

type Row = { from: number; to: number; seg: Segment | null }

/** One day, top to bottom, with the gaps made explicit: that is what AutoDJ
    actually does with them (the default rotation), and a grid can't say so. */
function rowsFor(day: number): Row[] {
  const segs = SEGMENTS.filter((s) => s.day === day).sort((a, b) => a.from - b.from)
  const rows: Row[] = []
  let cursor = 0
  for (const seg of segs) {
    if (seg.from > cursor) rows.push({ from: cursor, to: seg.from, seg: null })
    rows.push({ from: seg.from, to: seg.to, seg })
    cursor = seg.to
  }
  if (cursor < MINUTES_PER_DAY) rows.push({ from: cursor, to: MINUTES_PER_DAY, seg: null })
  return rows
}

/**
 * The Schedule page below md: a strip of seven days to pick from, then the
 * chosen day's rows (app/dashboard/stations/[slug]/schedule/DayList.tsx draws
 * the real one the same way, as does the Android app). The grid is hidden
 * there because a three-hour slot is 60px wide on a phone and reads as a dot.
 *
 * Until the clock is read the strip has no "today" and opens on Monday; once
 * it is, it opens on today and the current row is marked.
 */
export function WeekDayList({ now }: { now: Now | null }) {
  const [picked, setPicked] = useState<number | null>(null)
  const day = picked ?? now?.day ?? 1

  // Dates for the strip, from this browser's clock once it has been read.
  const dates = now ? dateNumbers(now.day) : null

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="Day" className="grid grid-cols-7 gap-1.5">
        {WEEK_ORDER.map((d) => {
          const on = d === day
          const today = now?.day === d
          const hasSlot = SEGMENTS.some((s) => s.day === d)
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPicked(d)}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-item outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                on ? "bg-foreground text-background" : "bg-surface-raised text-foreground hover:bg-surface-control",
              )}
            >
              <span className={cn("eyebrow-sm", !on && "text-muted-foreground")}>{DAY_LABEL[d]}</span>
              {dates && (
                <span className={cn("font-display text-meter-sm font-extrabold tabular-nums", today && !on && "text-on-air-text")}>
                  {dates[d]}
                </span>
              )}
              <span className="flex h-1.5 items-center" aria-hidden="true">
                {hasSlot && <span className={cn("size-1.5 rounded-full", on ? "bg-background/60" : "bg-on-air")} />}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-col">
        <span className="pb-2 font-display text-heading">{DAY_NAME[day]}</span>
        {rowsFor(day).map((row) => {
          const p = row.seg ? PLAYLISTS[row.seg.index] : null
          const swatch = row.seg ? SWATCHES[row.seg.index % SWATCHES.length] : null
          const isNow = now !== null && now.day === day && now.minute >= row.from && now.minute < row.to
          const note = row.seg?.wraps
            ? row.seg.tail
              ? `from ${DAY_LABEL[(day + 6) % 7]}`
              : `into ${DAY_LABEL[(day + 1) % 7]}`
            : null
          return (
            <div
              key={row.from}
              className={cn(
                "grid min-h-13 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-line py-2",
                isNow && "-mx-3 rounded-item border-transparent bg-surface-raised px-3",
              )}
            >
              <span className="font-mono text-caption text-text-faint tabular-nums">
                {hhmm(row.from)}–{row.seg?.wraps && !row.seg.tail ? p!.end : hhmm(row.to)}
              </span>
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden
                  className={cn("size-2.5 shrink-0 rounded-swatch", swatch ? swatch.dot : "border border-line-strong bg-surface-inset")}
                />
                <span className={cn("truncate text-body font-semibold", !p && "text-muted-foreground")}>{p ? p.name : "All Tracks"}</span>
                {note && <span className="shrink-0 text-caption text-text-faint">{note}</span>}
              </span>
              <span className="eyebrow-sm text-on-air-text">{isNow ? "Now" : ""}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Day-of-month for each weekday of the current Monday-first week, keyed by
    `getDay()`: Sunday is the end of the strip, so it is next Sunday's date
    when today is a weekday. */
function dateNumbers(today: number): Record<number, number> {
  const base = new Date()
  const todayPos = WEEK_ORDER.indexOf(today as (typeof WEEK_ORDER)[number])
  const out: Record<number, number> = {}
  WEEK_ORDER.forEach((d, pos) => {
    const dt = new Date(base)
    dt.setDate(base.getDate() + (pos - todayPos))
    out[d] = dt.getDate()
  })
  return out
}
