"use client"

import { useEffect, useState } from "react"
import { StatusLamp } from "@/components/ds/StatusLamp"
import { SWATCHES } from "@/lib/playlistSwatches"
import { cn } from "@/lib/utils"
import { WeekDayList } from "./WeekDayList"
import { DAY_LABEL, MINUTES_PER_DAY, PLAYLISTS, SEGMENTS, WEEK_ORDER, currentSegment, type Now, type PlaylistId } from "./weekMock"

const HOURS = [0, 6, 12, 18, 24]

function pct(minute: number) {
  return `${(minute / MINUTES_PER_DAY) * 100}%`
}

/**
 * The Schedule page's week grid, shaped like the real one so a visitor reads
 * it as "that is the screen I'll be using". The playlist chips are a filter:
 * pick one and the others fade, which is how you read a busy week there too.
 *
 * "Now" is this browser's clock, read after mount so the server and the
 * client never disagree; until then the lamp says On air and nothing more.
 *
 * Below lg the grid, its chips and its legend are replaced by WeekDayList,
 * the day strip + rows the real Schedule page uses on phones.
 */
export function WeekGrid() {
  const [filter, setFilter] = useState<PlaylistId | null>(null)
  const [now, setNow] = useState<Now | null>(null)

  useEffect(() => {
    const read = () => {
      const d = new Date()
      setNow({ day: d.getDay(), minute: d.getHours() * 60 + d.getMinutes() })
    }
    read()
    const t = setInterval(read, 60_000)
    return () => clearInterval(t)
  }, [])

  const current = currentSegment(now)
  const nowName = now ? (current ? PLAYLISTS[current.index].name : "All Tracks") : null

  return (
    <div className="flex flex-col gap-4.5 rounded-hero bg-card p-4 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3.5">
          <span className="font-display text-title">This week</span>
          <StatusLamp tone="onair" size="sm">
            On air{nowName ? ` · ${nowName}` : ""}
          </StatusLamp>
        </div>
        <div className="hidden flex-wrap gap-2 lg:flex" role="group" aria-label="Show one playlist">
          <Chip selected={filter === null} onClick={() => setFilter(null)}>
            All
          </Chip>
          {PLAYLISTS.map((p, i) => (
            <Chip key={p.id} selected={filter === p.id} onClick={() => setFilter(filter === p.id ? null : p.id)}>
              <span aria-hidden className={cn("size-2.5 rounded-swatch", SWATCHES[i % SWATCHES.length].dot)} />
              {p.name}
            </Chip>
          ))}
        </div>
      </div>

      {/* Below lg the grid gives way to the day list (see WeekDayList): at
          tablet width the blocks are too short for their names. */}
      <div className="lg:hidden">
        <WeekDayList now={now} />
      </div>

      <div className="hidden flex-col gap-1.5 lg:flex">
        <div className="grid grid-cols-[40px_1fr] gap-2.5">
          <span />
          <div className="flex justify-between font-mono text-micro text-text-faint" aria-hidden="true">
            {HOURS.map((h) => (
              <span key={h}>{String(h).padStart(2, "0")}</span>
            ))}
          </div>
        </div>
        {WEEK_ORDER.map((day) => {
          const today = now?.day === day
          return (
            <div key={day} className="grid grid-cols-[40px_1fr] items-center gap-2.5">
              <span className={cn("font-mono text-caption font-semibold uppercase tracking-wider", today ? "text-foreground" : "text-text-faint")}>
                {DAY_LABEL[day]}
              </span>
              <div className="relative h-9 rounded-item bg-surface-raised">
                {[6, 12, 18].map((h) => (
                  <span key={h} aria-hidden className="absolute inset-y-0 w-px bg-line" style={{ left: pct(h * 60) }} />
                ))}
                {SEGMENTS.filter((s) => s.day === day).map((s, i) => {
                  const p = PLAYLISTS[s.index]
                  const swatch = SWATCHES[s.index % SWATCHES.length]
                  const dim = filter !== null && filter !== p.id
                  return (
                    <span
                      key={`${p.id}-${i}`}
                      title={`${p.name} · ${p.start}–${p.end}`}
                      className={cn(
                        "absolute inset-y-0.75 flex items-center overflow-hidden px-2 font-mono text-micro font-semibold uppercase tracking-wider whitespace-nowrap transition-opacity duration-200",
                        s.wraps && s.from === 0 ? "rounded-r-chip" : s.wraps ? "rounded-l-chip" : "rounded-chip",
                        swatch.fill,
                        swatch.ink,
                        dim && "opacity-15",
                      )}
                      style={{ left: pct(s.from), width: `calc(${((s.to - s.from) / MINUTES_PER_DAY) * 100}% - 2px)` }}
                    >
                      <span className={cn("hidden", s.to - s.from >= 180 && "lg:inline")}>{p.name}</span>
                    </span>
                  )
                })}
                {today && now && (
                  <span
                    aria-hidden
                    className="absolute -inset-y-0.75 w-0.5 rounded-full bg-foreground"
                    style={{ left: pct(now.minute) }}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="hidden flex-wrap items-center gap-x-4.5 gap-y-1.5 text-body-sm text-muted-foreground lg:flex">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="size-3 rounded-swatch border border-line-strong bg-surface-inset" />
          All Tracks fills the gaps
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-3 w-0.5 rounded-full bg-foreground" />
          Now, on your station’s clock
        </span>
      </div>
    </div>
  )
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-chip px-3.5 text-body-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "bg-foreground text-background" : "bg-surface-control text-foreground hover:bg-surface-strong",
      )}
    >
      {children}
    </button>
  )
}
